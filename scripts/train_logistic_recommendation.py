#!/usr/bin/env python3
"""
Baseline Logistic Regression trainer for order-context recommendation examples.

IMPORTANT:
- `flatten_features()` MUST stay aligned with:
  `src/lib/recommendation-feature-flat.ts` (`flattenRecommendationFeaturesForBaselineModel`).
- Feature layout drift invalidates trained artifacts.
- Bump schema version in TS + Python together when changing flat features.

Usage (from repo root):
  pip install -r requirements-ml.txt
  python scripts/train_logistic_recommendation.py
  python scripts/train_logistic_recommendation.py --input artifacts/recommendation-data/dataset.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

SCHEMA_VERSION = "v1"

# --- Sync with src/types/business-segmentation.ts ---
BUSINESS_TYPES = [
    "bakery",
    "confectionery",
    "ice_cream_shop",
    "eastern_sweets",
    "western_sweets_pastry",
    "boutique_bakery",
    "neighborhood_bakery",
    "other",
]
SIZE_BANDS = ["small", "medium", "large"]
NEVER_PURCHASED_DAYS = 9999


def flatten_features(features: dict) -> dict[str, float]:
    h = features["userProductHistory"]
    c = features["categoryAffinity"]
    fav = features["favorite"]
    bp = features["businessProfile"]
    p = features["product"]

    days_raw = h.get("daysSinceLastPurchase")
    days = NEVER_PURCHASED_DAYS if days_raw is None else float(days_raw)

    spec = bp.get("specialization") or ""
    spec_len = min(len(str(spec)), 200) if spec else 0

    row: dict[str, float] = {
        "timesPurchasedTotal": float(h["timesPurchasedTotal"]),
        "timesPurchasedLast30d": float(h["timesPurchasedLast30d"]),
        "timesPurchasedLast90d": float(h["timesPurchasedLast90d"]),
        "daysSinceLastPurchase": float(days),
        "averageQuantity": float(h["averageQuantity"]),
        "totalQuantityOrdered": float(h["totalQuantityOrdered"]),
        "categoryPurchaseCount": float(c["categoryPurchaseCount"]),
        "categoryShare": float(c["categoryShare"]),
        "wasInLastOrder": 1.0 if h["wasInLastOrder"] else 0.0,
        "wasInLast3Orders": 1.0 if h["wasInLast3Orders"] else 0.0,
        "isTopCategoryForCustomer": 1.0 if c["isTopCategoryForCustomer"] else 0.0,
        "isExplicitFavorite": 1.0 if fav["isExplicitFavorite"] else 0.0,
        "product_price": float(p["price"]),
        "product_isActive": 1.0 if p.get("isActive") else 0.0,
        "spec_len": float(spec_len),
        "product_cat_len": float(min(len(str(p.get("category") or "")), 200)),
        "product_unit_len": float(min(len(str(p.get("unit") or "")), 80)),
        "packageSize_len": float(min(len(str(p.get("packageSize") or "")), 80)),
    }

    bt = bp.get("businessType")
    for t in BUSINESS_TYPES:
        row[f"bt_{t}"] = 1.0 if bt == t else 0.0

    sb = bp.get("sizeBand")
    for s in SIZE_BANDS:
        row[f"sb_{s}"] = 1.0 if sb == s else 0.0
    row["sb_missing"] = 1.0 if sb is None else 0.0

    return row


def to_iso(v: pd.Timestamp | None) -> str | None:
    if v is None or pd.isna(v):
        return None
    if v.tzinfo is None:
        v = v.tz_localize("UTC")
    return v.tz_convert("UTC").isoformat()


def precision_at_k_per_user(df: pd.DataFrame, y_true: np.ndarray, y_score: np.ndarray, k: int = 5) -> float:
    """Within each (userId, orderId) validation group, fraction of top-K by score that are positives."""
    df = df.copy()
    df["_y"] = y_true
    df["_s"] = y_score
    hits = []
    for (_, group) in df.groupby(["userId", "orderId"]):
        if len(group) < 2:
            continue
        g = group.sort_values("_s", ascending=False).head(k)
        hits.append(float(g["_y"].sum()) / min(k, len(group)))
    return float(np.mean(hits)) if hits else 0.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("artifacts/recommendation-data/dataset.jsonl"),
    )
    parser.add_argument("--out", type=Path, default=Path("artifacts/recommendation-logreg"))
    parser.add_argument("--test-size", type=float, default=0.2)
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Missing input file: {args.input}", file=sys.stderr)
        sys.exit(1)

    keys_path = Path("artifacts/recommendation-data/feature_keys.json")
    if not keys_path.exists():
        print(f"Missing {keys_path} — run admin POST /api/admin/recommendations/export-dataset first.", file=sys.stderr)
        sys.exit(1)
    keys_obj = json.loads(keys_path.read_text(encoding="utf-8"))
    if not isinstance(keys_obj, dict):
        print("feature_keys.json must be a metadata object, got legacy format.", file=sys.stderr)
        sys.exit(1)
    dataset_schema_version = keys_obj.get("schemaVersion")
    feature_order = keys_obj.get("featureKeys")
    if dataset_schema_version != SCHEMA_VERSION:
        print(
            f"Schema version mismatch. dataset={dataset_schema_version}, trainer={SCHEMA_VERSION}",
            file=sys.stderr,
        )
        sys.exit(1)
    if not isinstance(feature_order, list) or not feature_order:
        print("feature_keys.json missing featureKeys list.", file=sys.stderr)
        sys.exit(1)

    raw_lines = []
    ys = []
    meta_user = []
    meta_order = []
    meta_order_ts = []
    with args.input.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ex = json.loads(line)
            raw_lines.append(flatten_features(ex["features"]))
            ys.append(int(ex["label"]))
            meta_user.append(ex["userId"])
            meta_order.append(ex["orderId"])
            meta_order_ts.append(ex.get("orderCreatedAt"))

    if not raw_lines:
        print("Dataset is empty. Add orders/customers then export again.", file=sys.stderr)
        sys.exit(1)

    X = pd.DataFrame(raw_lines).fillna(0.0)
    for k in feature_order:
        if k not in X.columns:
            X[k] = 0.0
    X = X[[c for c in feature_order if c in X.columns]]
    y = np.array(ys, dtype=np.int32)
    X["userId"] = meta_user
    X["orderId"] = meta_order
    X["orderCreatedAt"] = pd.to_datetime(pd.Series(meta_order_ts), errors="coerce", utc=True)

    split_method = "time_based"
    fallback_notes: list[str] = []
    if len(X) < 30 or X["orderCreatedAt"].isna().all():
        split_method = "random_fallback"
        fallback_notes.append("time_based_split_unavailable_due_to_small_or_missing_timestamps")
        strat = y if len(np.unique(y)) > 1 else None
        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=args.test_size, random_state=42, stratify=strat
            )
        except ValueError:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=args.test_size, random_state=42, stratify=None
            )
    else:
        order_idx = np.argsort(X["orderCreatedAt"].values.astype("datetime64[ns]"))
        Xs = X.iloc[order_idx].reset_index(drop=True)
        ys_sorted = y[order_idx]
        split_at = max(1, int(len(Xs) * (1 - args.test_size)))
        split_at = min(split_at, len(Xs) - 1)
        X_train = Xs.iloc[:split_at].copy()
        X_test = Xs.iloc[split_at:].copy()
        y_train = ys_sorted[:split_at]
        y_test = ys_sorted[split_at:]
        if len(np.unique(y_train)) < 2 or len(np.unique(y_test)) < 2:
            split_method = "random_fallback"
            fallback_notes.append("time_based_split_degenerate_class_distribution")
            strat = y if len(np.unique(y)) > 1 else None
            try:
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y, test_size=args.test_size, random_state=42, stratify=strat
                )
            except ValueError:
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y, test_size=args.test_size, random_state=42, stratify=None
                )

    feature_cols = [c for c in X_train.columns if c not in ("userId", "orderId", "orderCreatedAt")]
    Xtr = X_train[feature_cols].values
    Xte = X_test[feature_cols].values

    clf = LogisticRegression(
        max_iter=4000,
        class_weight="balanced",
        solver="lbfgs",
    )
    clf.fit(Xtr, y_train)

    proba = clf.predict_proba(Xte)[:, 1]
    pred = (proba >= 0.5).astype(np.int32)

    trained_at = datetime.now(timezone.utc).isoformat()
    pos_rate_train = float(np.mean(y_train)) if len(y_train) > 0 else 0.0
    pos_rate_val = float(np.mean(y_test)) if len(y_test) > 0 else 0.0

    coef_pairs = list(zip(feature_cols, clf.coef_[0].tolist()))
    coef_sorted = sorted(coef_pairs, key=lambda x: x[1], reverse=True)
    top_positive = [{"feature": k, "coef": float(v)} for k, v in coef_sorted[:10]]
    top_negative = [{"feature": k, "coef": float(v)} for k, v in coef_sorted[-10:]]

    train_min = X_train["orderCreatedAt"].min() if "orderCreatedAt" in X_train else None
    train_max = X_train["orderCreatedAt"].max() if "orderCreatedAt" in X_train else None
    val_min = X_test["orderCreatedAt"].min() if "orderCreatedAt" in X_test else None
    val_max = X_test["orderCreatedAt"].max() if "orderCreatedAt" in X_test else None

    metrics = {
        "schemaVersion": SCHEMA_VERSION,
        "trainedAt": trained_at,
        "splitMethod": split_method,
        "nTrain": int(len(y_train)),
        "nValidation": int(len(y_test)),
        "nFeatures": len(feature_cols),
        "featureCount": len(feature_cols),
        "positiveRateTrain": pos_rate_train,
        "positiveRateValidation": pos_rate_val,
        "trainTimeRange": {"from": to_iso(train_min), "to": to_iso(train_max)},
        "validationTimeRange": {"from": to_iso(val_min), "to": to_iso(val_max)},
        "rocAuc": float(roc_auc_score(y_test, proba)) if len(np.unique(y_test)) > 1 else None,
        "averagePrecision": float(average_precision_score(y_test, proba)),
        "precision": float(precision_score(y_test, pred, zero_division=0)),
        "recall": float(recall_score(y_test, pred, zero_division=0)),
        "f1": float(f1_score(y_test, pred, zero_division=0)),
        "precisionAt5": precision_at_k_per_user(X_test, y_test, proba, k=5),
        "fallbackNotes": fallback_notes,
        "topPositiveCoefficients": top_positive,
        "topNegativeCoefficients": top_negative,
    }

    args.out.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": clf, "feature_cols": feature_cols}, args.out / "model.pkl")

    linear = {
        "schemaVersion": SCHEMA_VERSION,
        "trainedAt": trained_at,
        "intercept": float(clf.intercept_[0]),
        "coef": [float(x) for x in clf.coef_[0].tolist()],
        "feature_names": feature_cols,
        "feature_count": len(feature_cols),
    }
    (args.out / "linear_head.json").write_text(json.dumps(linear, indent=2), encoding="utf-8")
    (args.out / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(json.dumps(metrics, indent=2))
    print(f"Wrote {args.out / 'model.pkl'}, linear_head.json, metrics.json")


if __name__ == "__main__":
    main()

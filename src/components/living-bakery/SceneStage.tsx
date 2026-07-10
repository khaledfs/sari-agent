"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export type AmbienceSlot = "morning" | "midday" | "evening";

type AmbiencePhoto = {
  name: AmbienceSlot;
  file: string;
  position: string;
  steamOrigins: Array<{ left: string; top: string }>;
};

const AMBIENCE_PHOTOS: AmbiencePhoto[] = [
  {
    name: "morning",
    file: "morning.webp",
    position: "24% 42%",
    steamOrigins: [
      { left: "16%", top: "60%" },
      { left: "29%", top: "62%" },
      { left: "42%", top: "58%" },
    ],
  },
  {
    name: "midday",
    file: "oven.webp",
    position: "52% 40%",
    steamOrigins: [
      { left: "46%", top: "62%" },
      { left: "54%", top: "59%" },
      { left: "62%", top: "64%" },
    ],
  },
  {
    name: "evening",
    file: "patisserie.webp",
    position: "38% 44%",
    steamOrigins: [
      { left: "30%", top: "60%" },
      { left: "40%", top: "58%" },
      { left: "55%", top: "63%" },
    ],
  },
];

const CROSS_FADE_MS = 2000;
const TIME_CHECK_MS = 60_000;

function photoForHour(hour: number): AmbienceSlot {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "midday";
  return "evening";
}

function findPhoto(name: AmbienceSlot) {
  return AMBIENCE_PHOTOS.find((photo) => photo.name === name) ?? AMBIENCE_PHOTOS[0];
}

let requestScene: ((scene: AmbienceSlot) => void) | null = null;

export function setScene(scene: AmbienceSlot) {
  requestScene?.(scene);
}

export function SceneStage() {
  const pathname = usePathname();
  const [scene, setSceneState] = useState<AmbienceSlot>(() => photoForHour(new Date().getHours()));
  const [fadingScene, setFadingScene] = useState<AmbienceSlot | null>(null);
  const [paused, setPaused] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const changeScene = useCallback((next: AmbienceSlot) => {
    setSceneState((current) => {
      if (next === current) return current;
      setFadingScene(current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => setFadingScene(null), CROSS_FADE_MS);
      return next;
    });
  }, []);

  useEffect(() => {
    requestScene = changeScene;
    return () => {
      requestScene = null;
    };
  }, [changeScene]);

  useEffect(() => {
    const id = setInterval(() => {
      changeScene(photoForHour(new Date().getHours()));
    }, TIME_CHECK_MS);
    return () => clearInterval(id);
  }, [changeScene]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, []);

  const isHome = /^\/[^/]+\/dashboard\/?$/.test(pathname ?? "");
  const activePhoto = findPhoto(scene);
  const fadingPhoto = fadingScene ? findPhoto(fadingScene) : null;

  const backgroundImage = (photo: AmbiencePhoto) => `linear-gradient(180deg, rgba(58, 36, 16, 0.68), rgba(58, 36, 16, 0.2)), url(/ambience/${photo.file})`;

  return (
    <div className={`lb-stage ${isHome ? "lb-stage--home" : "lb-stage--band"}`} data-paused={paused ? "true" : "false"} aria-hidden="true">
      {fadingPhoto ? (
        <div
          className="lb-photo-layer lb-photo-layer--out"
          style={{
            backgroundImage: backgroundImage(fadingPhoto),
            backgroundPosition: fadingPhoto.position,
          }}
        />
      ) : null}
      <div
        className={`lb-photo-layer${fadingPhoto ? " lb-photo-layer--in" : ""}`}
        key={activePhoto.name}
        style={{
          backgroundImage: backgroundImage(activePhoto),
          backgroundPosition: activePhoto.position,
        }}
      />
      <div className="lb-light-ray" aria-hidden="true" />
      <div className="lb-steam" aria-hidden="true">
        {activePhoto.steamOrigins.map((origin, index) => (
          <span
            key={index}
            className="lb-steam-wisp"
            style={{ left: origin.left, top: origin.top, animationDelay: `${index * 1.2}s` }}
          />
        ))}
      </div>
      <div className="lb-dust" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}

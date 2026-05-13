"use client";

import { useState, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Sparkles, Zap, Brain, Shield, Globe, Code, ArrowRight, Star, CheckCircle2, Rocket } from "lucide-react";

export const PremiumShowcase = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.8]);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const features = [
    {
      icon: Brain,
      title: "Deep Thinking AI",
      description: "Advanced reasoning with multi-step problem solving",
      gradient: "from-purple-600 to-pink-600",
      delay: 0,
    },
    {
      icon: Globe,
      title: "Web Search",
      description: "Real-time information from across the internet",
      gradient: "from-blue-600 to-cyan-600",
      delay: 0.1,
    },
    {
      icon: Code,
      title: "Canvas Mode",
      description: "Interactive workspace for creative projects",
      gradient: "from-orange-600 to-red-600",
      delay: 0.2,
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Instant responses with optimized performance",
      gradient: "from-yellow-600 to-orange-600",
      delay: 0.3,
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description: "Enterprise-grade security for your data",
      gradient: "from-green-600 to-emerald-600",
      delay: 0.4,
    },
    {
      icon: Sparkles,
      title: "AI-Powered",
      description: "State-of-the-art language models",
      gradient: "from-indigo-600 to-purple-600",
      delay: 0.5,
    },
  ];

  const stats = [
    { value: "99.9%", label: "Uptime", icon: Rocket },
    { value: "10M+", label: "Messages", icon: Star },
    { value: "<100ms", label: "Response Time", icon: Zap },
    { value: "100%", label: "Secure", icon: Shield },
  ];

  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "Product Designer",
      content: "This AI assistant has completely transformed how I work. The interface is stunning and the responses are incredibly helpful.",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
    },
    {
      name: "Michael Chen",
      role: "Software Engineer",
      content: "The best AI assistant I've ever used. The search and think modes are game-changers for my development workflow.",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
    },
    {
      name: "Emily Rodriguez",
      role: "Content Creator",
      content: "Beautiful design meets powerful AI. The voice input and image upload features make it incredibly versatile.",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      {/* Hero Section */}
      <motion.section
        style={{ opacity, scale }}
        className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8"
      >
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute w-[800px] h-[800px] rounded-full bg-gradient-to-r from-purple-500/30 to-pink-500/30 blur-3xl"
            animate={{
              x: [0, 100, 0],
              y: [0, -50, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 20, repeat: Infinity }}
            style={{ left: "10%", top: "10%" }}
          />
          <motion.div
            className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-r from-blue-500/30 to-cyan-500/30 blur-3xl"
            animate={{
              x: [0, -100, 0],
              y: [0, 50, 0],
              scale: [1, 1.2, 1],
            }}
            transition={{ duration: 15, repeat: Infinity }}
            style={{ right: "10%", bottom: "10%" }}
          />
        </div>

        <div className="relative z-10 text-center max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-full mb-6"
              whileHover={{ scale: 1.05 }}
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-300">Powered by Advanced AI</span>
            </motion.div>

            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black mb-6 leading-tight">
              <span className="bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
                The Future of
              </span>
              <br />
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                AI Assistance
              </span>
            </h1>

            <p className="text-xl sm:text-2xl text-slate-300 mb-10 max-w-3xl mx-auto leading-relaxed">
              Experience the next generation of AI with stunning visuals, lightning-fast responses, and unparalleled intelligence.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-semibold text-lg shadow-2xl overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                <span className="relative flex items-center gap-2">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl font-semibold text-lg hover:bg-slate-800 transition-all"
              >
                Watch Demo
              </motion.button>
            </div>
          </motion.div>

          {/* Floating cards animation */}
          <div className="mt-20 relative h-64">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute left-1/2 top-1/2 w-80 h-48 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{
                  opacity: isVisible ? 1 : 0,
                  scale: isVisible ? 1 : 0.8,
                  x: [0, i * 30 - 30, i * 30 - 30],
                  y: [0, i * 20 - 20, i * 20 - 20],
                  rotate: [0, i * 5 - 5, i * 5 - 5],
                }}
                transition={{ duration: 0.8, delay: i * 0.2 }}
                style={{ zIndex: 3 - i }}
              />
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-8 h-12 border-2 border-slate-600 rounded-full flex items-start justify-center p-2">
            <motion.div
              className="w-2 h-2 bg-purple-500 rounded-full"
              animate={{ y: [0, 20, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>
      </motion.section>

      {/* Stats Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -5, scale: 1.02 }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 text-center">
                  <stat.icon className="w-8 h-8 mx-auto mb-3 text-purple-400" />
                  <div className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                    {stat.value}
                  </div>
                  <div className="text-sm text-slate-400">{stat.label}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Powerful Features
              </span>
            </h2>
            <p className="text-xl text-slate-400">Everything you need in one beautiful interface</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: feature.delay }}
                viewport={{ once: true }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="group relative"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} rounded-2xl blur-xl opacity-0 group-hover:opacity-50 transition-opacity`} />
                <div className="relative h-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 hover:border-slate-700 transition-all">
                  <div className={`inline-flex p-3 bg-gradient-to-br ${feature.gradient} rounded-xl mb-4`}>
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{feature.description}</p>
                  <div className="mt-6 flex items-center text-sm font-medium text-purple-400 group-hover:text-purple-300 transition-colors">
                    Learn more
                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Loved by Thousands
              </span>
            </h2>
            <p className="text-xl text-slate-400">See what our users are saying</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -8 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 h-full">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-slate-300 mb-6 leading-relaxed">{testimonial.content}</p>
                  <div className="flex items-center gap-3">
                    <img
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <div className="font-semibold">{testimonial.name}</div>
                      <div className="text-sm text-slate-400">{testimonial.role}</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-32 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl blur-3xl opacity-30" />
            <div className="relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-16">
              <Sparkles className="w-16 h-16 mx-auto mb-6 text-purple-400" />
              <h2 className="text-5xl font-bold mb-6">
                <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  Ready to Get Started?
                </span>
              </h2>
              <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
                Join thousands of users who are already experiencing the future of AI assistance.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <motion.button
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-semibold text-lg shadow-2xl"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                  <span className="relative flex items-center gap-2">
                    Start Free Trial
                    <Rocket className="w-5 h-5" />
                  </span>
                </motion.button>
              </div>
              <div className="mt-8 flex items-center justify-center gap-8 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Cancel anytime
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

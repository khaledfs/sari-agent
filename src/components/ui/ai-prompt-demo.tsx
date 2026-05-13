"use client";

import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Zap, Brain, MessageSquare, TrendingUp, Shield } from "lucide-react";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  files?: File[];
}

const DemoOne = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: "Hello! I'm your AI assistant. I can help you with search, deep thinking, and creative work. Try uploading an image or using voice input!",
      role: "assistant",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleSendMessage = async (message: string, files?: File[]) => {
    if (!message.trim() && (!files || files.length === 0)) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      role: "user",
      timestamp: new Date(),
      files,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      setIsTyping(false);
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: getAIResponse(message),
        role: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
      setIsLoading(false);
    }, 2000);
  };

  const getAIResponse = (userMessage: string): string => {
    if (userMessage.toLowerCase().includes("[search:")) {
      return "🌐 Searching the web for relevant information... I found several interesting results that might help you!";
    }
    if (userMessage.toLowerCase().includes("[think:")) {
      return "🧠 Let me think deeply about this... After careful consideration, here's my analysis with multiple perspectives on the topic.";
    }
    if (userMessage.toLowerCase().includes("[canvas:")) {
      return "📁 Creating in canvas mode... I've prepared a structured workspace for your project!";
    }
    return "Thanks for your message! I'm here to help. You can try using Search, Think, or Canvas modes for enhanced capabilities. Feel free to upload images or use voice input!";
  };

  const features = [
    { icon: Sparkles, label: "AI-Powered", color: "from-purple-500 to-pink-500" },
    { icon: Zap, label: "Lightning Fast", color: "from-yellow-500 to-orange-500" },
    { icon: Brain, label: "Deep Thinking", color: "from-blue-500 to-cyan-500" },
  ];

  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-3xl"
          animate={{
            x: mousePosition.x / 50 - 300,
            y: mousePosition.y / 50 - 300,
          }}
          transition={{ type: "spring", stiffness: 50, damping: 30 }}
          style={{ left: "20%", top: "20%" }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-r from-blue-500/20 to-cyan-500/20 blur-3xl"
          animate={{
            x: -mousePosition.x / 70 + 250,
            y: -mousePosition.y / 70 + 250,
          }}
          transition={{ type: "spring", stiffness: 50, damping: 30 }}
          style={{ right: "15%", bottom: "15%" }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 blur-3xl"
          animate={{
            x: mousePosition.x / 100,
            y: -mousePosition.y / 100,
          }}
          transition={{ type: "spring", stiffness: 60, damping: 40 }}
          style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
        />
      </div>

      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxwYXRoIGQ9Ik0wIDBoMzAwdjMwMEgweiIgZmlsdGVyPSJ1cmwoI2EpIiBvcGFjaXR5PSIuMDUiLz48L3N2Zz4=')]" />

      {/* Main container */}
      <div className="relative z-10 flex flex-col h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-8"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                className="relative"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur-xl opacity-50" />
                <div className="relative bg-gradient-to-br from-purple-600 to-pink-600 p-3 rounded-2xl">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
              </motion.div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
                  Sari AI Assistant
                </h1>
                <p className="text-slate-400 text-sm mt-1">Powered by advanced intelligence</p>
              </div>
            </div>

            {/* Feature badges */}
            <div className="hidden md:flex items-center gap-3">
              {features.map((feature, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="group relative"
                >
                  <div className={`absolute inset-0 bg-gradient-to-r ${feature.color} rounded-xl blur-md opacity-50 group-hover:opacity-75 transition-opacity`} />
                  <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl px-4 py-2 flex items-center gap-2">
                    <feature.icon className="w-4 h-4 text-slate-300" />
                    <span className="text-sm font-medium text-slate-300">{feature.label}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.header>

        {/* Chat messages area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex-1 overflow-hidden mb-6 relative"
        >
          {/* Glass container */}
          <div className="h-full bg-slate-900/30 backdrop-blur-2xl rounded-3xl border border-slate-800/50 shadow-2xl overflow-hidden">
            {/* Messages scroll area */}
            <div className="h-full overflow-y-auto px-6 py-8 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              <AnimatePresence mode="popLayout">
                {messages.map((message, idx) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[80%] ${message.role === "user" ? "order-2" : "order-1"}`}>
                      {/* Avatar */}
                      <div className="flex items-start gap-3">
                        {message.role === "assistant" && (
                          <motion.div
                            whileHover={{ rotate: 360 }}
                            transition={{ duration: 0.6 }}
                            className="relative flex-shrink-0"
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl blur-md opacity-50" />
                            <div className="relative bg-gradient-to-br from-purple-600 to-pink-600 p-2.5 rounded-xl">
                              <Sparkles className="w-5 h-5 text-white" />
                            </div>
                          </motion.div>
                        )}

                        {/* Message bubble */}
                        <div className="flex-1">
                          <motion.div
                            whileHover={{ y: -2 }}
                            transition={{ type: "spring", stiffness: 400 }}
                            className={`relative group ${
                              message.role === "user"
                                ? "bg-gradient-to-br from-blue-600 to-purple-600"
                                : "bg-slate-800/80 backdrop-blur-xl border border-slate-700/50"
                            } rounded-2xl px-5 py-3.5 shadow-lg`}
                          >
                            {message.role === "user" && (
                              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity" />
                            )}
                            <p className={`relative text-[15px] leading-relaxed ${
                              message.role === "user" ? "text-white" : "text-slate-200"
                            }`}>
                              {message.content}
                            </p>
                            {message.files && message.files.length > 0 && (
                              <div className="mt-2 flex gap-2">
                                <div className="text-xs text-slate-400 bg-slate-900/50 px-2 py-1 rounded">
                                  📎 {message.files.length} file(s)
                                </div>
                              </div>
                            )}
                          </motion.div>
                          <p className="text-xs text-slate-500 mt-1.5 px-2">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        {message.role === "user" && (
                          <div className="relative flex-shrink-0">
                            <div className="bg-gradient-to-br from-blue-600 to-cyan-600 p-2.5 rounded-xl">
                              <MessageSquare className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Typing indicator */}
              <AnimatePresence>
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex justify-start"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl blur-md opacity-50" />
                        <div className="relative bg-gradient-to-br from-purple-600 to-pink-600 p-2.5 rounded-xl">
                          <Sparkles className="w-5 h-5 text-white animate-pulse" />
                        </div>
                      </div>
                      <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl px-5 py-3.5 shadow-lg">
                        <div className="flex gap-1.5">
                          <motion.div
                            className="w-2 h-2 bg-slate-400 rounded-full"
                            animate={{ y: [0, -8, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                          />
                          <motion.div
                            className="w-2 h-2 bg-slate-400 rounded-full"
                            animate={{ y: [0, -8, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                          />
                          <motion.div
                            className="w-2 h-2 bg-slate-400 rounded-full"
                            animate={{ y: [0, -8, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>

            {/* Floating stats overlay */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute top-6 right-6 bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl px-4 py-2.5 shadow-xl"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-slate-300">Online</span>
                </div>
                <div className="w-px h-4 bg-slate-700" />
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs font-medium text-slate-300">{messages.length} msgs</span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Input area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="pb-8 relative"
        >
          <div className="max-w-4xl mx-auto relative">
            {/* Glow effect */}
            <div className="absolute -inset-2 bg-gradient-to-r from-purple-600/20 via-pink-600/20 to-blue-600/20 rounded-[2rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative group">
              <PromptInputBox
                onSend={handleSendMessage}
                isLoading={isLoading}
                placeholder="Ask me anything... Try Search, Think, or Canvas modes!"
              />
            </div>

            {/* Quick action suggestions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap items-center justify-center gap-2 mt-4"
            >
              <span className="text-xs text-slate-500">Try:</span>
              {["Search the web", "Think deeply", "Create canvas", "Upload image"].map((suggestion, idx) => (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="text-xs px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-full text-slate-400 hover:text-slate-300 transition-all backdrop-blur-xl"
                >
                  {suggestion}
                </motion.button>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Floating particles */}
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white rounded-full opacity-20"
          initial={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
          }}
          animate={{
            y: [null, Math.random() * window.innerHeight],
            x: [null, Math.random() * window.innerWidth],
          }}
          transition={{
            duration: Math.random() * 20 + 10,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />
      ))}
    </div>
  );
};

export { DemoOne };

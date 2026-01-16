
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { generateSilhouetteImage, generateRandomMelody } from './services/geminiService';
import { NoteData, PlacedNote } from './types';
import { audioPlayer } from './utils/audioPlayer';

// Particle definition for the drifting effect
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    // Random velocity for drifting
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = (Math.random() - 0.7) * 3 - 1; // Drift upwards
    this.maxLife = 40 + Math.random() * 40;
    this.life = this.maxLife;
    this.color = color;
    this.size = 1 + Math.random() * 3;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    this.vy -= 0.05; // Light gravity/buoyancy
  }

  draw(ctx: CanvasRenderingContext2D) {
    const alpha = this.life / this.maxLife;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    // Glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
  }
}

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cutoutSrc, setCutoutSrc] = useState<string | null>(null);
  const [placedNotes, setPlacedNotes] = useState<PlacedNote[]>([]);
  const [currentNoteIndex, setCurrentNoteIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playbackRef = useRef<boolean>(false);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const validSpotsRef = useRef<{ x: number, y: number }[]>([]);

  const prismaticColors = ['#22d3ee', '#a855f7', '#ec4899', '#fb923c'];

  // Animation loop for particles
  useEffect(() => {
    let animationFrameId: number;
    const render = () => {
      const canvas = particleCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.shadowBlur = 0; // Reset for next iteration
        
        particles.current = particles.current.filter(p => p.life > 0);
        particles.current.forEach(p => {
          p.update();
          p.draw(ctx);
        });
      }
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Trigger particle burst when note index changes
  useEffect(() => {
    if (currentNoteIndex !== null && validSpotsRef.current.length > 0) {
      const burstCount = 60;
      for (let i = 0; i < burstCount; i++) {
        const spot = validSpotsRef.current[Math.floor(Math.random() * validSpotsRef.current.length)];
        const color = prismaticColors[Math.floor(Math.random() * prismaticColors.length)];
        // Add particle with some randomness around the spot
        particles.current.push(new Particle(spot.x, spot.y, color));
      }
    }
  }, [currentNoteIndex]);

  const processSilhouette = useCallback(async (imgUrl: string, melody: NoteData[]) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 500;
      canvas.height = 500;
      ctx.drawImage(img, 0, 0, 500, 500);

      const imageData = ctx.getImageData(0, 0, 500, 500);
      const data = imageData.data;
      const validSpots: { x: number, y: number }[] = [];

      const cutoutCanvas = document.createElement('canvas');
      cutoutCanvas.width = 500;
      cutoutCanvas.height = 500;
      const cutoutCtx = cutoutCanvas.getContext('2d');
      if (!cutoutCtx) return;

      const cutoutData = cutoutCtx.createImageData(500, 500);
      const targetData = cutoutData.data;

      const step = 15;
      for (let y = 0; y < 500; y++) {
        for (let x = 0; x < 500; x++) {
          const index = (y * 500 + x) * 4;
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          
          const isBackground = r < 20 && g < 20 && b < 20;

          if (!isBackground) {
            targetData[index] = r;
            targetData[index + 1] = g;
            targetData[index + 2] = b;
            targetData[index + 3] = 255;

            if (y % step === 0 && x % step === 0 && y > step && y < 500-step && x > step && x < 500-step) {
                validSpots.push({ x, y });
            }
          } else {
            targetData[index + 3] = 0;
          }
        }
      }

      if (validSpots.length === 0) {
        setError("无法在黑暗中编织形状，请尝试其他词汇。");
        return;
      }

      validSpotsRef.current = validSpots;
      cutoutCtx.putImageData(cutoutData, 0, 0);
      setCutoutSrc(cutoutCanvas.toDataURL());

      const newPlacedNotes: PlacedNote[] = melody.map((note, idx) => {
        const spotIndex = Math.floor(Math.random() * validSpots.length);
        const spot = validSpots[spotIndex];
        return {
          ...note,
          id: `note-${idx}-${Math.random()}`,
          x: spot.x,
          y: spot.y
        };
      });

      setPlacedNotes(newPlacedNotes);
    };
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setPlacedNotes([]);
    setCutoutSrc(null);
    setCurrentNoteIndex(null);
    setIsPlaying(false);
    playbackRef.current = false;
    particles.current = [];
    validSpotsRef.current = [];

    try {
      const [imgUrl, melody] = await Promise.all([
        generateSilhouetteImage(prompt),
        generateRandomMelody(prompt)
      ]);

      if (imgUrl) {
        await processSilhouette(imgUrl, melody);
      } else {
        setError("生成失败，请稍后重试。");
      }
    } catch (err) {
      setError("编织图案时出错。");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      playbackRef.current = false;
      setIsPlaying(false);
      return;
    }

    if (placedNotes.length === 0) return;

    setIsPlaying(true);
    playbackRef.current = true;

    for (let i = 0; i < placedNotes.length; i++) {
      if (!playbackRef.current) break;
      setCurrentNoteIndex(i);
      const note = placedNotes[i];
      await audioPlayer.playNote(note.frequency, note.duration, note.value);
    }

    setCurrentNoteIndex(null);
    setIsPlaying(false);
    playbackRef.current = false;
  };

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center min-h-screen silk-container">
      <div className="max-w-3xl w-full text-center mb-16 relative z-10">
        <h1 className="text-7xl font-black mb-4 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 tracking-tighter drop-shadow-2xl">
          Prismatic Silk
        </h1>
        <p className="text-white/20 text-sm font-black tracking-[0.4em] uppercase opacity-40">
          Audio-Visual Rhythm Synthesis
        </p>
      </div>

      <div className="w-full max-w-xl glass-card p-2 rounded-[40px] mb-12 relative z-10">
        <div className="flex p-2 gap-3">
          <input
            type="text"
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-3xl px-8 py-4 text-white focus:outline-none focus:border-cyan-500/50 transition-colors placeholder:text-white/10 text-lg"
            placeholder="输入词汇 (如: 凤凰, 海豚, 星辰)..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            disabled={isLoading}
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            className="bg-white/10 hover:bg-white/20 text-white px-10 py-4 rounded-3xl font-black tracking-widest uppercase text-xs transition-all active:scale-95 disabled:opacity-20 shadow-xl"
          >
            {isLoading ? <i className="fas fa-spinner fa-spin"></i> : "Weave"}
          </button>
        </div>
        {error && <p className="text-rose-400 text-center pb-4 text-[10px] font-black tracking-widest uppercase">{error}</p>}
      </div>

      <div className="relative w-full max-w-[540px] aspect-square glass-card rounded-[120px] flex items-center justify-center overflow-visible group relative z-10">
        {cutoutSrc ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-12 overflow-visible">
              <img 
                key={`silk-shaking-${currentNoteIndex}`}
                src={cutoutSrc} 
                alt="Silk Cutout Silhouette" 
                className={`w-full h-full object-contain mix-blend-screen opacity-90 scale-125 ${currentNoteIndex !== null ? 'animate-fabric-beat' : ''}`}
                style={{ 
                  filter: 'contrast(1.2) saturate(1.6) brightness(1.2) drop-shadow(0 0 20px rgba(0,255,255,0.2))',
                }}
              />
              {/* Particle Layer Canvas */}
              <canvas 
                ref={particleCanvasRef}
                width={500}
                height={500}
                className="absolute inset-0 w-full h-full pointer-events-none z-20"
                style={{ mixBlendMode: 'screen' }}
              />
            </div>
            
            <div className="absolute inset-0 pointer-events-none">
              {placedNotes.map((note, idx) => (
                <div
                  key={note.id}
                  style={{ 
                    left: `${note.x}px`, 
                    top: `${note.y}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className={`absolute flex items-center justify-center w-10 h-10 rounded-full border border-white/20 backdrop-blur-3xl transition-all duration-500 shadow-lg
                    ${currentNoteIndex === idx 
                      ? 'bg-white text-black scale-150 z-30 shadow-[0_0_40px_rgba(255,255,255,0.8)] animate-jump border-none' 
                      : 'bg-white/5 text-white/40 z-10'
                    }`}
                >
                  <span className="text-[10px] font-black">{note.value}</span>
                </div>
              ))}
            </div>
            
            <button
              onClick={togglePlayback}
              className="absolute -bottom-10 bg-white text-slate-900 px-16 py-5 rounded-full font-black tracking-[0.4em] uppercase text-[10px] flex items-center gap-4 transition-all z-40 shadow-2xl active:scale-90 hover:scale-105"
            >
              <i className={`fas ${isPlaying ? 'fa-stop' : 'fa-play'}`}></i>
              {isPlaying ? 'Release' : 'Unveil Rhythm'}
            </button>
          </>
        ) : (
          <div className="text-white/5 text-center flex flex-col items-center gap-12 p-12">
            {isLoading ? (
              <div className="flex flex-col items-center gap-6">
                <div className="w-20 h-20 border-2 border-white/5 border-t-cyan-500 rounded-full animate-spin"></div>
                <p className="animate-pulse tracking-[0.5em] uppercase text-[9px] font-black text-white/20">Spinning Prismatic Silk...</p>
              </div>
            ) : (
              <>
                <div className="w-32 h-32 rounded-full bg-white/[0.01] flex items-center justify-center border border-white/[0.03] group-hover:scale-110 transition-all duration-1000 shadow-inner">
                  <i className="fas fa-magic text-6xl opacity-10"></i>
                </div>
                <p className="max-w-[300px] leading-relaxed text-[9px] font-black tracking-[0.5em] uppercase opacity-20">Enter a concept to weave its silhouette.</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-44 w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-20 px-12 opacity-30 hover:opacity-100 transition-opacity">
        <div className="text-center group">
          <h3 className="text-white font-black mb-4 text-xs tracking-[0.4em] uppercase">粒子飘散</h3>
          <p className="text-[10px] text-white/50 leading-relaxed font-semibold tracking-widest uppercase">
            每一次音节的跳动都会激发边缘粒子的剥离与飘散，模拟一种能量的释放。
          </p>
        </div>
        <div className="text-center group">
          <h3 className="text-white font-black mb-4 text-xs tracking-[0.4em] uppercase">脉冲晃动</h3>
          <p className="text-[10px] text-white/50 leading-relaxed font-semibold tracking-widest uppercase">
            抠图后的独立图层在演奏时进行物理晃动，背景保持静止，增强空间感。
          </p>
        </div>
        <div className="text-center group">
          <h3 className="text-white font-black mb-4 text-xs tracking-[0.4em] uppercase">视听编织</h3>
          <p className="text-[10px] text-white/50 leading-relaxed font-semibold tracking-widest uppercase">
            AI 生成的棱镜丝绸褶皱与随机生成的旋律完美契合，达成多维度的感官互动。
          </p>
        </div>
      </div>

      <footer className="mt-40 pb-20 text-white/10 text-[9px] tracking-[1.2em] uppercase font-black text-center">
        Fluid Interactive Art &bull; Silhouette & Particle Synthesis
      </footer>
    </div>
  );
};

export default App;

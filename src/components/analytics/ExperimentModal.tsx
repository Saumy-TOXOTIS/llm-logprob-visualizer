import { X, FlaskConical, ShieldCheck, FileCode2, RadioTower } from 'lucide-react';
import { ParsedToken, BranchingAlternative, BranchExplorationMode } from '@/types';

interface ExperimentModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: ParsedToken | null;
  alternative: BranchingAlternative | null;
  onContinue: (mode: BranchExplorationMode, alternative: BranchingAlternative) => void;
}

export function ExperimentModal({ isOpen, onClose, token, alternative, onContinue }: ExperimentModalProps) {
  if (!isOpen || !token || !alternative) return null;

  const tags = alternative.safetyTags || ['normal'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 backdrop-blur-sm p-4">
      <div className="bg-[#fbf7ef] border border-stone-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col text-stone-900">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-[#f4eee4]">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-[#b85c38]" />
            <h2 className="font-semibold text-stone-900">Branch Research</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-200 rounded text-stone-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4">
          <div className="bg-white p-3 rounded-xl border border-stone-200 font-mono text-sm leading-relaxed text-stone-700">
            ... <span className="line-through text-stone-400 opacity-70">"{token.token}"</span> 
            <span className="bg-[#d97757]/15 text-[#9a3412] px-1 ml-1 rounded">"{alternative.token}"</span> ...
          </div>

          <div className="flex gap-2 flex-wrap">
            {tags.map(t => (
              <span key={t} className={`text-[10px] uppercase px-2 py-0.5 rounded font-bold ${
                t === 'normal' ? 'bg-stone-100 text-stone-500 border border-stone-200' :
                ['violence', 'cyber', 'self-harm', 'illegal', 'hate/harassment', 'sexual'].includes(t) ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {t}
              </span>
            ))}
          </div>
          
          <p className="text-xs text-stone-500 border-l-2 border-[#d97757]/50 pl-3">
             Local research mode: labels are observability metadata only. Raw continuation sends the branch prefix directly to your local model.
          </p>

          <div className="grid grid-cols-1 gap-2 mt-2">
             <button 
                onClick={() => { onContinue('raw_continuation', alternative); onClose(); }}
                className="p-3 rounded-xl border border-[#d97757]/30 bg-[#d97757]/10 hover:bg-[#d97757]/15 text-left flex items-center gap-3 transition-colors text-stone-900"
             >
                <RadioTower className="w-5 h-5 text-[#b85c38]" />
                <div>
                  <div className="font-semibold text-sm">Raw Continuation</div>
                  <div className="text-xs text-stone-500">Continue the exact alternate branch with no extra analysis wrapper.</div>
                </div>
             </button>

             <button 
                onClick={() => { onContinue('normal', alternative); onClose(); }}
                className="p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-left flex items-center gap-3 transition-colors text-stone-900"
             >
                <FlaskConical className="w-5 h-5 text-stone-500" />
                <div>
                  <div className="font-semibold text-sm">Instruction-Preserved Continuation</div>
                  <div className="text-xs text-stone-500">Continue this path using the current conversation settings.</div>
                </div>
             </button>

             <button 
                onClick={() => { onContinue('safe_analysis', alternative); onClose(); }}
                className="p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-left flex items-center gap-3 transition-colors text-stone-900"
             >
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="font-semibold text-sm">Safe Analysis</div>
                  <div className="text-xs text-stone-500">Ask the model to analyze the branch intent instead of completing it.</div>
                </div>
             </button>

             <button 
                onClick={() => { onContinue('local_preview', alternative); onClose(); }}
                className="p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-left flex items-center gap-3 transition-colors text-stone-900"
             >
                <FileCode2 className="w-5 h-5 text-stone-500" />
                <div>
                  <div className="font-semibold text-sm">Local Preview Only</div>
                  <div className="text-xs text-stone-500">Preview the token substitution without API calls.</div>
                </div>
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}

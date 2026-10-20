import React, { useEffect, useState } from 'react';
import { useTour } from '../../context/TourContext';
import { Compass, X, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';

export const TourOverlay: React.FC = () => {
  const { isActive, activeTour, currentStep, currentStepIndex, nextStep, prevStep, endTour } = useTour();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!isActive || !currentStep) {
      setTargetRect(null);
      return;
    }

    const updateRect = () => {
      const el = document.querySelector(currentStep.target);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isActive, currentStep, currentStepIndex]);

  if (!isActive || !activeTour || !currentStep) return null;

  const isLastStep = currentStepIndex === activeTour.steps.length - 1;

  // Calculate tooltip placement
  let tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 9999,
  };

  if (targetRect) {
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      tooltipStyle = {
        position: 'fixed',
        bottom: '24px',
        left: '16px',
        right: '16px',
        zIndex: 9999,
      };
    } else if (currentStep.placement === 'bottom' && spaceBelow > 220) {
      tooltipStyle = {
        position: 'fixed',
        top: `${targetRect.bottom + 12}px`,
        left: `${Math.max(16, Math.min(window.innerWidth - 380, targetRect.left))}px`,
        zIndex: 9999,
      };
    } else if (currentStep.placement === 'top' && spaceAbove > 220) {
      tooltipStyle = {
        position: 'fixed',
        bottom: `${window.innerHeight - targetRect.top + 12}px`,
        left: `${Math.max(16, Math.min(window.innerWidth - 380, targetRect.left))}px`,
        zIndex: 9999,
      };
    } else if (currentStep.placement === 'left') {
      tooltipStyle = {
        position: 'fixed',
        top: `${Math.max(20, targetRect.top)}px`,
        left: `${Math.max(16, targetRect.left - 360)}px`,
        zIndex: 9999,
      };
    } else {
      tooltipStyle = {
        position: 'fixed',
        top: `${Math.max(20, targetRect.top)}px`,
        left: `${Math.min(window.innerWidth - 380, targetRect.right + 12)}px`,
        zIndex: 9999,
      };
    }
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto">
      {/* Dimmed backdrop with pulsing border on target */}
      <div 
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-all duration-300"
        onClick={() => endTour(false)}
      />

      {/* Target element spotlight frame */}
      {targetRect && (
        <div
          className="fixed rounded-xl ring-4 ring-rowing-400 ring-offset-4 ring-offset-slate-950 pointer-events-none transition-all duration-300 shadow-[0_0_30px_rgba(56,171,247,0.4)] animate-pulse"
          style={{
            top: `${targetRect.top - 4}px`,
            left: `${targetRect.left - 4}px`,
            width: `${targetRect.width + 8}px`,
            height: `${targetRect.height + 8}px`,
            zIndex: 9998,
          }}
        />
      )}

      {/* Tooltip Card */}
      <div 
        style={tooltipStyle}
        className="w-full max-w-[360px] bg-slate-900 border border-rowing-500/40 rounded-2xl p-5 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rowing-500/20 flex items-center justify-center text-rowing-400">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-rowing-400">
                {activeTour.name}
              </h4>
              <p className="text-[11px] text-slate-400">
                Step {currentStepIndex + 1} of {activeTour.steps.length}
              </p>
            </div>
          </div>
          <button 
            onClick={() => endTour(false)}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Title & Content */}
        <h3 className="text-base font-bold text-white mb-1.5">
          {currentStep.title}
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed mb-5">
          {currentStep.content}
        </p>

        {/* Step Progress Dots & Navigation Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5">
            {activeTour.steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStepIndex 
                    ? 'w-5 bg-rowing-400' 
                    : i < currentStepIndex 
                    ? 'w-1.5 bg-rowing-600' 
                    : 'w-1.5 bg-slate-700'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <button
                onClick={prevStep}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}

            <button
              onClick={nextStep}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-rowing-600 to-rowing-500 hover:from-rowing-500 hover:to-rowing-400 rounded-lg shadow-md hover:shadow-rowing-500/20 transition-all flex items-center gap-1.5"
            >
              {isLastStep ? (
                <>
                  Finish Tour <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                </>
              ) : (
                <>
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

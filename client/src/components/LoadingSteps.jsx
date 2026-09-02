import { useEffect, useState } from 'react';

// Cycles through a list of step labels while `active` is true, giving a sense of
// progress for an operation that's actually a single fast call underneath.
export default function LoadingSteps({ steps, active, stepDurationMs = 700 }) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setCurrentStep(0);
      return;
    }
    const timers = steps.map((_, i) => setTimeout(() => setCurrentStep(i), i * stepDurationMs));
    return () => timers.forEach(clearTimeout);
  }, [active, steps, stepDurationMs]);

  if (!active) return null;

  return (
    <div className="loading-steps">
      {steps.map((label, i) => (
        <div key={label} className={`loading-step ${i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending'}`}>
          <span className="loading-step-icon">{i < currentStep ? '✓' : i === currentStep ? '…' : ''}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function totalLoadingDuration(steps, stepDurationMs = 700) {
  return steps.length * stepDurationMs;
}

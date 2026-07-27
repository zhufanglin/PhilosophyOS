import { Check, Circle } from "lucide-react";

export type OutlineStep = {
  id: string;
  label: string;
  detail: string;
  state: "complete" | "current" | "upcoming";
};

type DialogueOutlineProps = {
  steps: OutlineStep[];
  pulseStepId?: string | null;
};

export function DialogueOutline({ steps, pulseStepId }: DialogueOutlineProps) {
  return (
    <aside className="dialogue-outline" aria-labelledby="outline-title">
      <div className="outline-heading">
        <span>Research index</span>
        <h2 id="outline-title">研究阶段</h2>
      </div>
      <ol tabIndex={0}>
        {steps.map((step, index) => (
          <li
            className={`${step.state}${pulseStepId === step.id ? " is-pulsing" : ""}`}
            data-step-id={step.id}
            key={step.id}
          >
            <span className="outline-marker" aria-hidden="true">
              {step.state === "complete" ? <Check size={13} /> : <Circle size={9} />}
            </span>
            <div>
              <span>0{index + 1}</span>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

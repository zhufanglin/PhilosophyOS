import { Check, Circle, MessageCircleQuestion } from "lucide-react";

export type OutlineStep = {
  id: string;
  label: string;
  detail: string;
  state: "complete" | "current" | "upcoming";
};

type DialogueOutlineProps = {
  steps: OutlineStep[];
};

export function DialogueOutline({ steps }: DialogueOutlineProps) {
  return (
    <aside className="dialogue-outline" aria-labelledby="outline-title">
      <div className="outline-heading">
        <MessageCircleQuestion size={17} />
        <h2 id="outline-title">对话脉络</h2>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li className={step.state} key={step.id}>
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

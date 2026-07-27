import type { CSSProperties } from "react";

export type ThoughtTransitionState = {
  phase: "contract" | "portrait" | "reveal";
  philosopher: string;
  era: string;
  portraitUrl: string;
  portraitPosition: string;
  quote: string;
  quoteSource: string;
  originX: number;
  originY: number;
  targetX?: number;
  targetY?: number;
};

type ThoughtTransitionProps = {
  transition: ThoughtTransitionState;
};

export function ThoughtTransition({ transition }: ThoughtTransitionProps) {
  const style = {
    "--thought-origin-x": `${transition.originX}px`,
    "--thought-origin-y": `${transition.originY}px`,
    "--thought-target-x": `${transition.targetX ?? window.innerWidth / 2}px`,
    "--thought-target-y": `${transition.targetY ?? window.innerHeight * 0.78}px`,
  } as CSSProperties;

  return (
    <div className={`thought-transition is-${transition.phase}`} style={style} aria-hidden="true">
      <div className="thought-transition-spread">
        <figure>
          <img
            src={transition.portraitUrl}
            alt=""
            style={{ objectPosition: transition.portraitPosition }}
          />
          <figcaption>
            <span>ENTERING THE QUESTION</span>
            <strong>{transition.philosopher}</strong>
            <small>{transition.era}</small>
          </figcaption>
        </figure>
        <blockquote>
          <p>“{transition.quote}”</p>
          <cite>— {transition.philosopher}，{transition.quoteSource}</cite>
        </blockquote>
      </div>
    </div>
  );
}

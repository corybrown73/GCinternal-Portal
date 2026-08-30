import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The one button.
 *
 * THE RESTING STATE CARRIES THE AFFORDANCE. Every variant except `ghost` and
 * `link` keeps a fill or a border at rest, so a button looks pressable before
 * anything is hovering it. The lift is confirmation — "yes, this one" — not the
 * thing that tells you it is a button. An interface where you have to wave the
 * pointer around to discover what is clickable has already failed the people
 * who never wave it: touch users, and anyone reading a screenshot.
 *
 * `.lift` (styles.css) owns the motion, the shadow and the focus outline. It is
 * defined once, and clickable cards get `.lift-card` — the same idea tuned for
 * a bigger surface. Nothing re-implements either.
 *
 * TWO THINGS THAT LOOK LIKE OVERSIGHTS AND ARE NOT:
 *
 * 1. `disabled:pointer-events-none` is gone. It suppresses hover, which is what
 *    we want, but it also suppresses the CURSOR — so a disabled button showed a
 *    plain arrow and gave no reason for not responding. `.lift` guards its own
 *    hover states on `:not(:disabled)` instead, which leaves `not-allowed`
 *    visible.
 *
 * 2. Focus is an `outline`, not a `ring`. Tailwind's rings are box-shadows, and
 *    box-shadow is the property the lift animates — a ring would be painted
 *    over by the hover shadow at the exact moment a keyboard user needs it.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-sm font-medium cursor-pointer",
    "lift",
    // NO `focus-visible:outline-none` here. It was carried over from the days
    // when focus was drawn as a `ring`, and it silently won: a Tailwind utility
    // outranks the `.lift` component rule, so `:focus-visible` matched, the
    // outline colour resolved, and the computed width came back 0px — an
    // invisible focus indicator that every automated check would call present.
    // Caught by reading the computed style rather than the source.
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      // Each hover is ONE step of background change — enough to register
      // alongside the lift, not so much that the button looks like a different
      // control than the one you aimed at.
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // Ghost and link are the deliberate exceptions: they live inside dense
        // surfaces where a resting shadow on every one would read as clutter.
        // They keep the transition and the focus outline and drop the shadow.
        ghost: "shadow-none hover:bg-accent hover:text-accent-foreground",
        link: "shadow-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

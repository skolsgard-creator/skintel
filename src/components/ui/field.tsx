import * as React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// Formulärfält. <Field> äger etiketten, hjälptexten och felet och kopplar
// dem till kontrollen inuti via id och aria-describedby, så att en
// skärmläsare läser upp allt i rätt ordning. <Input> och <Textarea>
// hämtar kopplingen ur en context och fungerar också fristående.
//
// Fel visas i bärnsten, inte rött: samma enda accentfärg som resten av
// gränssnittet använder för "det här behöver din uppmärksamhet".

type FieldContextValue = {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

type FieldProps = {
  label: React.ReactNode;
  /** Kort hjälptext under fältet. */
  hint?: React.ReactNode;
  /** Felmeddelande. När det finns markeras fältet som ogiltigt. */
  error?: React.ReactNode;
  /** Sätt om etiketten ska visas som frivillig. */
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
};

function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
        <Label htmlFor={id}>
          {label}
          {optional ? (
            <span className="font-normal text-muted-foreground"> (frivilligt)</span>
          ) : null}
        </Label>
        {children}
        {error ? (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 text-sm font-medium text-amber-ink"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}
        {hint ? (
          <p id={hintId} className="text-sm text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm font-medium leading-snug text-foreground", className)}
      {...props}
    />
  );
}

const controlClass = [
  "w-full min-w-0 rounded-xl border border-input bg-card text-base text-foreground",
  "placeholder:text-faint",
  "transition-[border-color,box-shadow] duration-150",
  "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
  "aria-invalid:border-amber-ink aria-invalid:focus-visible:ring-amber/35",
  "disabled:cursor-not-allowed disabled:opacity-50",
];

function useControlProps<
  T extends {
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  },
>(props: T) {
  const ctx = React.useContext(FieldContext);
  return {
    id: props.id ?? ctx?.id,
    "aria-describedby": props["aria-describedby"] ?? ctx?.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (ctx?.invalid ? true : undefined),
  };
}

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  const control = useControlProps(props);
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(controlClass, "h-13 px-4", className)}
      {...props}
      {...control}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const control = useControlProps(props);
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, "min-h-28 resize-none px-4 py-3 leading-normal", className)}
      {...props}
      {...control}
    />
  );
}

/** Ett val ur en kort lista (månad, region). Webbläsarens egen väljare --
 *  i telefonen är den bäst -- med samma form som fälten. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  const control = useControlProps(props);
  return (
    <select data-slot="select" className={cn(controlClass, "h-13 px-4", className)} {...props} {...control} />
  );
}

export { Field, Label, Input, Textarea, Select };

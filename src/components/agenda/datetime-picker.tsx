"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

// `toISOString()` joga pra UTC e desloca a hora escolhida. Formata no fuso local.
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function DateTimePicker({ value, onChange, label }: DateTimePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [month, setMonth] = useState(() => {
    if (value) {
      const d = new Date(value);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date();
  });

  const selectedDate = value ? new Date(value) : null;
  const time = selectedDate
    ? `${String(selectedDate.getHours()).padStart(2, "0")}:${String(selectedDate.getMinutes()).padStart(2, "0")}`
    : "09:00";

  const displayDate = selectedDate?.toLocaleDateString("pt-BR") || "Selecionar data";

  const handleDateClick = (day: number) => {
    const selected = new Date(month.getFullYear(), month.getMonth(), day);
    const [h, m] = time.split(":");
    selected.setHours(parseInt(h), parseInt(m));
    onChange(toLocalInput(selected));
    setShowCalendar(false);
  };

  const handleTimeChange = (newTime: string) => {
    if (value) {
      const d = new Date(value);
      const [h, m] = newTime.split(":");
      d.setHours(parseInt(h), parseInt(m));
      onChange(toLocalInput(d));
    }
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const days = [];
  const firstDay = getFirstDayOfMonth(month);
  const daysInMonth = getDaysInMonth(month);

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const monthName = month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const weekDays = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-sm font-semibold text-[var(--color-foreground)]">
          {label}
        </label>
      )}

      {/* Data */}
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowCalendar(!showCalendar)}
          className="w-full h-10 justify-between px-3"
        >
          <span className={selectedDate ? "text-[var(--color-foreground)]" : "text-[var(--color-muted)]"}>
            {displayDate}
          </span>
          <Calendar className="w-4 h-4" />
        </Button>

        {showCalendar && (
          <div className="absolute top-12 left-0 z-50 bg-white border border-[var(--color-border)] rounded-lg p-3 space-y-3 shadow-lg w-72">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1))}
                className="p-1 hover:bg-[var(--color-surface-2)] rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-sm capitalize">{monthName}</span>
              <button
                type="button"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1))}
                className="p-1 hover:bg-[var(--color-surface-2)] rounded"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Dias da semana */}
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-[var(--color-muted)] h-6 flex items-center justify-center">
                  {d}
                </div>
              ))}
            </div>

            {/* Dias do mês */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={!day}
                  onClick={() => day && handleDateClick(day)}
                  className={`h-7 text-xs rounded font-medium transition-colors ${
                    !day
                      ? "text-[var(--color-border)] cursor-default"
                      : day === selectedDate?.getDate() && month.getMonth() === selectedDate?.getMonth()
                      ? "bg-[var(--color-primary)] text-white"
                      : "hover:bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hora */}
      <Input
        type="time"
        value={time}
        onChange={(e) => handleTimeChange(e.target.value)}
        className="h-10 text-sm"
      />
    </div>
  );
}

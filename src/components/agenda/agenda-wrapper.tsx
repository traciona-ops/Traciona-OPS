"use client";

import { useState } from "react";
import { AgendaCalendar, type CalMeeting } from "./agenda-calendar";
import { CreateMeetingDialog } from "./create-meeting-dialog";

export function AgendaWrapper({ meetings }: { meetings: CalMeeting[] }) {
  const [selectedDate, setSelectedDate] = useState<string>("");

  return (
    <>
      <CreateMeetingDialog
        initialDate={selectedDate}
        onClose={() => setSelectedDate("")}
      />
      <AgendaCalendar
        meetings={meetings}
        onDateDoubleClick={(date) => setSelectedDate(date)}
      />
    </>
  );
}

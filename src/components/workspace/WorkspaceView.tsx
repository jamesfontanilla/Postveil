import { useState } from "react";
import { ArrowDown, Briefcase, CalendarDays, ListTodo, Plus } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { workStateLabel, workDueLabel, displayWorkNote, formatDate } from "../../lib/format";
import type { Task, CalendarEvent, WorkItem, WorkSummary, Message } from "../../types/mail";

export default function Workspace({
  mode,
  tasks,
  events,
  workItems,
  workSummary,
  onOpenMessage,
  onRefresh,
}: {
  mode: "calendar" | "tasks";
  tasks: Task[];
  events: CalendarEvent[];
  workItems: WorkItem[];
  workSummary: WorkSummary;
  onOpenMessage: (message: Message) => void;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");

  async function addTask() {
    if (!title.trim()) return;
    setError("");
    try {
      await apiFetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          dueAt: date ? new Date(date).toISOString() : null,
        }),
      });
      setTitle("");
      setDate("");
      onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the task");
    }
  }

  async function addEvent() {
    if (!title.trim()) return;
    setError("");
    try {
      const start = date ? new Date(date) : new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await apiFetch("/api/calendar", {
        method: "POST",
        body: JSON.stringify({
          title,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        }),
      });
      setTitle("");
      setDate("");
      onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the event");
    }
  }

  async function toggleTask(task: Task) {
    setError("");
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !task.completed }),
      });
      onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the task");
    }
  }

  return (
    <section className="workspace-view">
      <div className="workspace-head">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>
            {mode === "calendar" ? (
              <>
                <CalendarDays size={23} /> Calendar
              </>
            ) : (
              <>
                <Briefcase size={23} /> Work
              </>
            )}
          </h1>
        </div>
        <div className="workspace-stamp">
          {mode === "calendar"
            ? "Events from email can become appointments."
            : "Keep promises, follow-ups, and next actions in one queue."}
        </div>
      </div>
      {error && <div className="inline-error workspace-error">{error}</div>}
      {mode === "tasks" && (
        <div className="work-summary" aria-label="Work summary">
          <div className="work-summary-card">
            <span>Reply later</span>
            <strong>{workSummary.reply_later}</strong>
          </div>
          <div className="work-summary-card">
            <span>Waiting on</span>
            <strong>{workSummary.waiting_on}</strong>
          </div>
          <div className="work-summary-card">
            <span>I owe</span>
            <strong>{workSummary.i_owe}</strong>
          </div>
          <div className={`work-summary-card ${workSummary.overdue ? "overdue" : ""}`}>
            <span>Overdue</span>
            <strong>{workSummary.overdue}</strong>
          </div>
        </div>
      )}
      <div className="workspace-grid">
        <div className="setting-card workspace-create">
          <h3>{mode === "calendar" ? "Add an event" : "Add a task"}</h3>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={mode === "calendar" ? "Event title" : "Task title"}
          />
          <input
            type="datetime-local"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <button
            className="primary-button"
            onClick={() => void (mode === "calendar" ? addEvent() : addTask())}
          >
            <Plus size={15} /> Add {mode === "calendar" ? "event" : "task"}
          </button>
        </div>
        <div className="workspace-list">
          {mode === "calendar" ? (
            events.length ? (
              events.map((event) => (
                <article className="event-card" key={event.id}>
                  <div className="event-time">{formatDate(event.starts_at)}</div>
                  <div>
                    <strong>{event.title}</strong>
                    <p>{new Date(event.starts_at).toLocaleString()}</p>
                  </div>
                </article>
              ))
            ) : (
              <div className="list-empty">
                <CalendarDays size={25} />
                <p>No events yet.</p>
              </div>
            )
          ) : (
            <>
              <div className="work-queue-head">
                <div>
                  <p className="eyebrow">MESSAGE QUEUE</p>
                  <h3>Follow-ups</h3>
                </div>
                <span>{workItems.length} open</span>
              </div>
              {workItems.length ? (
                workItems.map((item) => (
                  <article className={`work-item ${item.overdue ? "overdue" : ""}`} key={item.id}>
                    <button onClick={() => onOpenMessage(item)} className="work-item-main">
                      <span className="work-state-label">{workStateLabel(item.work_state)}</span>
                      <strong>{item.subject || "(no subject)"}</strong>
                      <small>
                        {item.from_address} · {workDueLabel(item.follow_up_at)}
                      </small>
                      {displayWorkNote(item.work_note) && <em>{displayWorkNote(item.work_note)}</em>}
                    </button>
                    <button
                      className="icon-button compact-icon"
                      onClick={() => onOpenMessage(item)}
                      aria-label={`Open ${item.subject || "message"}`}
                      title="Open message"
                    >
                      <ArrowDown size={14} className="open-work-icon" />
                    </button>
                  </article>
                ))
              ) : (
                <div className="list-empty compact-empty">
                  <Briefcase size={25} />
                  <p>No message follow-ups yet.</p>
                  <small>Use Reply later, Waiting on, or I owe from a message.</small>
                </div>
              )}
              <div className="work-queue-head task-queue-head">
                <div>
                  <p className="eyebrow">TASKS</p>
                  <h3>To Do</h3>
                </div>
                <span>{tasks.filter((task) => !task.completed).length} open</span>
              </div>
              {tasks.length ? (
                tasks.map((task) => (
                  <label className={`task-card ${task.completed ? "completed" : ""}`} key={task.id}>
                    <input type="checkbox" checked={task.completed} onChange={() => void toggleTask(task)} />
                    <span>
                      <strong>{task.title}</strong>
                      <small>{task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"}</small>
                    </span>
                  </label>
                ))
              ) : (
                <div className="list-empty compact-empty">
                  <ListTodo size={25} />
                  <p>No tasks yet.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

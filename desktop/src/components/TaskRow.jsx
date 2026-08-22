import { dueLabel, humanDuration } from '../lib/format.js';
import { IconCheck } from './Icons.jsx';

export default function TaskRow({ task, tasks, snapshot, disabled, onAction, compact = false }) {
  const done = task.status === 'done';
  const due = dueLabel(task.dueAt);
  const isTracking = snapshot.session?.taskId === task.id;
  const running = snapshot.state === 'running';

  const toggle = () => onAction(() => tasks.setStatus(task.id, done ? 'open' : 'done'));

  // Switching task mid-session would split the time across two records, so the
  // running session is stopped first and a new one opened against this task.
  const track = () =>
    onAction(async () => {
      if (running) await window.api.tracker.stop('manual');
      await window.api.tracker.start({ taskId: task.id, taskNote: task.title });
    });

  return (
    <div className={['task', done && 'done', compact && 'compact'].filter(Boolean).join(' ')}>
      <button className="check" data-checked={done} disabled={disabled} onClick={toggle} title={done ? 'Reopen' : 'Mark done'}>
        <IconCheck width={13} height={13} />
      </button>

      <div className="task-body">
        <div className="task-title truncate">{task.title}</div>
        {task.context && <div className="task-desc truncate">{task.context}</div>}
        {task.description && <div className="task-desc truncate">{task.description}</div>}

        <div className="task-meta">
          {task.source === 'bmos' && <span className="chip accent">Brand Macros OS</span>}
          {task.priority === 'high' && <span className="chip high">High priority</span>}
          {task.parentTitle && <span className="chip">Subtask</span>}
          {due && !done && <span className={due.overdue ? 'chip overdue' : 'chip'}>{due.text}</span>}
          {task.estimateMinutes ? <span className="chip">Est. {humanDuration(task.estimateMinutes * 60)}</span> : null}
          {isTracking && running && <span className="chip accent">Tracking now</span>}
        </div>
      </div>

      {!done && (
        <button className="task-track" disabled={disabled || (isTracking && running)} onClick={track}>
          {isTracking && running ? 'Tracking' : 'Track'}
        </button>
      )}
    </div>
  );
}

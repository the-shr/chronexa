import { useSettings } from '../lib/hooks.js';

export default function Settings() {
  const [settings, update] = useSettings();
  if (!settings) return <div className="page">Loading…</div>;

  const set = (group) => (key, value) => update({ [group]: { [key]: value } });
  const shots = set('screenshots');
  const idle = set('idle');
  const general = set('general');

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <button className="btn ghost" onClick={() => window.api.settings.reset()}>
          Reset to defaults
        </button>
      </header>

      <section className="panel">
        <h2>Screenshots</h2>

        <Toggle
          label="Capture screenshots while tracking"
          checked={settings.screenshots.enabled}
          onChange={(v) => shots('enabled', v)}
        />

        <Slider
          label="Capture interval"
          suffix="minutes"
          min={1}
          max={60}
          value={settings.screenshots.intervalMinutes}
          disabled={!settings.screenshots.enabled}
          onChange={(v) => shots('intervalMinutes', v)}
          hint="One screenshot per window of this length."
        />

        <Toggle
          label="Randomise the moment inside each interval"
          checked={settings.screenshots.randomize}
          disabled={!settings.screenshots.enabled}
          onChange={(v) => shots('randomize', v)}
          hint="Prevents the capture time from being predictable."
        />

        <Toggle
          label="Capture all monitors"
          checked={settings.screenshots.allMonitors}
          disabled={!settings.screenshots.enabled}
          onChange={(v) => shots('allMonitors', v)}
        />

        <Slider
          label="Image quality"
          suffix="%"
          min={10}
          max={100}
          step={5}
          value={settings.screenshots.quality}
          disabled={!settings.screenshots.enabled}
          onChange={(v) => shots('quality', v)}
        />

        <Slider
          label="Max image width"
          suffix="px"
          min={640}
          max={3840}
          step={160}
          value={settings.screenshots.maxWidth}
          disabled={!settings.screenshots.enabled}
          onChange={(v) => shots('maxWidth', v)}
        />

        <Toggle
          label="Privacy blur"
          checked={settings.screenshots.blur}
          disabled={!settings.screenshots.enabled}
          onChange={(v) => shots('blur', v)}
          hint="Pixelates the image so activity is visible but text is not readable."
        />

        <Toggle
          label="Notify me on every capture"
          checked={settings.screenshots.notifyOnCapture}
          disabled={!settings.screenshots.enabled}
          onChange={(v) => shots('notifyOnCapture', v)}
        />
      </section>

      <section className="panel">
        <h2>Idle detection</h2>

        <Toggle
          label="Detect idle (no mouse or keyboard input)"
          checked={settings.idle.enabled}
          onChange={(v) => idle('enabled', v)}
        />

        <Slider
          label="Idle after"
          suffix="minutes"
          min={1}
          max={60}
          value={settings.idle.thresholdMinutes}
          disabled={!settings.idle.enabled}
          onChange={(v) => idle('thresholdMinutes', v)}
          hint="How long without input before you are considered away."
        />

        <Toggle
          label="Show a warning before acting"
          checked={settings.idle.warningEnabled}
          disabled={!settings.idle.enabled}
          onChange={(v) => idle('warningEnabled', v)}
        />

        <Slider
          label="Warning countdown"
          suffix="seconds"
          min={10}
          max={300}
          step={5}
          value={settings.idle.warningCountdownSeconds}
          disabled={!settings.idle.enabled || !settings.idle.warningEnabled}
          onChange={(v) => idle('warningCountdownSeconds', v)}
        />

        <Choice
          label="When the countdown ends"
          value={settings.idle.onTimeout}
          disabled={!settings.idle.enabled}
          onChange={(v) => idle('onTimeout', v)}
          options={[
            { value: 'stop', label: 'Stop the timer' },
            { value: 'keep', label: 'Keep the timer running' },
          ]}
        />

        <Toggle
          label="Discard idle time from the tracked total"
          checked={settings.idle.discardIdleTime}
          disabled={!settings.idle.enabled}
          onChange={(v) => idle('discardIdleTime', v)}
          hint="Removes the idle stretch, including the minutes before idle was confirmed."
        />

        <Toggle
          label="Play a sound with the warning"
          checked={settings.idle.playSound}
          disabled={!settings.idle.enabled || !settings.idle.warningEnabled}
          onChange={(v) => idle('playSound', v)}
        />
      </section>

      <section className="panel">
        <h2>General</h2>
        <Toggle
          label="Start Chronexa when I log in"
          checked={settings.general.launchOnLogin}
          onChange={(v) => general('launchOnLogin', v)}
        />
        <Toggle
          label="Start tracking automatically on launch"
          checked={settings.general.startTrackingOnLaunch}
          onChange={(v) => general('startTrackingOnLaunch', v)}
        />
        <Toggle
          label="Keep running in the tray when the window is closed"
          checked={settings.general.minimizeToTray}
          onChange={(v) => general('minimizeToTray', v)}
        />
      </section>
    </div>
  );
}

/* ------------------------------ form pieces ----------------------------- */

function Toggle({ label, checked, onChange, disabled, hint }) {
  return (
    <label className={`field toggle ${disabled ? 'disabled' : ''}`}>
      <span className="field-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

function Slider({ label, value, min, max, step = 1, suffix, onChange, disabled, hint }) {
  return (
    <div className={`field slider ${disabled ? 'disabled' : ''}`}>
      <div className="field-text">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="slider-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="slider-value mono">
          {value} {suffix}
        </span>
      </div>
    </div>
  );
}

function Choice({ label, value, options, onChange, disabled }) {
  return (
    <div className={`field ${disabled ? 'disabled' : ''}`}>
      <div className="field-text">{label}</div>
      <div className="choice-row">
        {options.map((o) => (
          <button
            key={o.value}
            className={value === o.value ? 'chip active' : 'chip'}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

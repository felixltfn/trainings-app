import { useState } from 'react';

import { RestTimer } from './RestTimer';
import { CalendarScreen } from './screens/CalendarScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { TrainingTab } from './screens/TrainingTab';
import { loadTimer, saveTimer, type TimerState } from './timer';

type Tab = 'start' | 'training' | 'calendar' | 'stats' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'start', label: 'Start', icon: 'M4 11 12 4l8 7M6 10v10h12V10' },
  { id: 'training', label: 'Training', icon: 'M4 9v6M20 9v6M7 6v12M17 6v12M7 12h10' },
  { id: 'calendar', label: 'Kalender', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { id: 'stats', label: 'Statistik', icon: 'M5 20V11M12 20V4M19 20v-6' },
  { id: 'settings', label: 'Einstellungen', icon: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('start');
  const [timer, setTimerState] = useState<TimerState | null>(loadTimer);
  // Day to open in the calendar, e.g. right after finishing a workout
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  // Short confirmation after finishing a workout
  const [justFinished, setJustFinished] = useState(false);

  const setTimer = (t: TimerState | null) => {
    setTimerState(t);
    saveTimer(t);
  };

  const showDay = (date: string) => {
    setCalendarDay(date);
    setTab('calendar');
  };

  // After "Training beenden": confirmation, then back to the start screen
  const handleFinished = () => {
    setTimer(null);
    setTab('start');
    setJustFinished(true);
    window.setTimeout(() => setJustFinished(false), 1800);
  };

  return (
    <>
      {tab === 'start' && (
        <OverviewScreen
          onGoToWorkout={() => setTab('training')}
          onOpenDay={showDay}
          onGoToSettings={() => setTab('settings')}
        />
      )}
      {tab === 'training' && <TrainingTab onSetDone={setTimer} onFinished={handleFinished} />}
      {tab === 'calendar' && <CalendarScreen openDay={calendarDay} onOpenDay={setCalendarDay} />}
      {tab === 'stats' && <StatsScreen />}
      {tab === 'settings' && <SettingsScreen />}

      {timer && <RestTimer timer={timer} onChange={setTimer} />}

      {justFinished && (
        <div className="done-overlay" role="status">
          <div className="done-badge">✓</div>
          <p className="done-text">Training gespeichert</p>
        </div>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}

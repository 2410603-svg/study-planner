import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { isFirebaseConfigured, loadFromCloud, saveToCloud } from './firebase';
import { buildSubjectComparison, buildSubjectDetailData, buildSubjectGrowth, buildTrendData } from './statistics';

type Subject = '국어(화법과 작문)' | '수학(확률과 통계)' | '영어' | '한국사' | '경제' | '사회문화';

type StudyPlan = {
  id: string;
  title: string;
  subject: Subject;
  area: string;
  material: string;
  goal: string;
  estimatedHours: number;
  startDate: string;
  dueDate: string;
  priority: '높음' | '보통' | '낮음';
  recurring: boolean;
  completed: boolean;
  completedDate?: string;
  memo: string;
};

type StudySession = {
  id: string;
  subject: Subject;
  area: string;
  duration: number;
  date: string;
  memo: string;
  startTime?: string;
};

type WrongAnswer = {
  id: string;
  title: string;
  subject: Subject;
  reason: string;
  reviewDate: string;
  status: '미복습' | '복습 완료';
  memo: string;
};

type MockExam = {
  id: string;
  name: string;
  examDate: string;
  subjectResults: Array<{
    subject: Subject;
    score: number;
    grade: string;
    percentile: number;
    correct: number;
    wrong: number;
    skipped: number;
  }>;
};

type DailyJournal = {
  id: string;
  date: string;
  mood: string;
  focus: string;
  condition: string;
  wins: string;
  struggles: string;
  memo: string;
};

type NotificationSetting = {
  enabled: boolean;
  time: string;
};

const subjectOptions: Subject[] = ['국어(화법과 작문)', '수학(확률과 통계)', '영어', '한국사', '경제', '사회문화'];

const createDefaultSubjectResults = (): MockExam['subjectResults'] =>
  subjectOptions.map((subject) => ({
    subject,
    score: 0,
    grade: '',
    percentile: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
  }));

const initialPlans: StudyPlan[] = [
  {
    id: 'plan-1',
    title: '수학(확률과 통계) 문제 20개 풀기',
    subject: '수학(확률과 통계)',
    area: '확률과 통계',
    material: '수학의 바이블',
    goal: '20문제 풀이',
    estimatedHours: 2,
    startDate: '2026-07-31',
    dueDate: '2026-08-02',
    priority: '높음',
    recurring: false,
    completed: false,
    memo: '오답까지 확인하며 풀기',
  },
  {
    id: 'plan-2',
    title: '영어 단어 50개 암기하기',
    subject: '영어',
    area: '단어',
    material: '영단기',
    goal: '50개 암기',
    estimatedHours: 1,
    startDate: '2026-07-31',
    dueDate: '2026-08-01',
    priority: '보통',
    recurring: true,
    completed: false,
    memo: '하루 2회 복습',
  },
];

const initialSessions: StudySession[] = [];

const initialExams: MockExam[] = [
  {
    id: 'exam-1',
    name: '7월 모의고사',
    examDate: '2026-07-20',
    subjectResults: [
      { subject: '국어(화법과 작문)', score: 84, grade: '2등급', percentile: 78, correct: 30, wrong: 4, skipped: 1 },
      { subject: '수학(확률과 통계)', score: 76, grade: '3등급', percentile: 62, correct: 26, wrong: 6, skipped: 1 },
      { subject: '영어', score: 88, grade: '2등급', percentile: 81, correct: 32, wrong: 3, skipped: 0 },
      { subject: '한국사', score: 95, grade: '1등급', percentile: 95, correct: 20, wrong: 0, skipped: 0 },
      { subject: '경제', score: 82, grade: '2등급', percentile: 73, correct: 17, wrong: 3, skipped: 0 },
    ],
  },
];

const initialNotes: WrongAnswer[] = [
  {
    id: 'note-1',
    title: '확률 문제 오답',
    subject: '수학(확률과 통계)',
    reason: '개념 부족',
    reviewDate: '2026-08-01',
    status: '미복습',
    memo: '공식 정리 필요',
  },
];

const formatDate = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getToday = () => formatDate(new Date().toISOString());

function App() {
  const [plans, setPlans] = useState<StudyPlan[]>(() => {
    const saved = localStorage.getItem('study-plans');
    return saved ? JSON.parse(saved) : initialPlans;
  });
  const [sessions, setSessions] = useState<StudySession[]>(() => {
    const saved = localStorage.getItem('study-sessions');
    return saved ? JSON.parse(saved) : initialSessions;
  });
  const [exams, setExams] = useState<MockExam[]>(() => {
    const saved = localStorage.getItem('study-exams');
    return saved ? JSON.parse(saved) : initialExams;
  });
  const [notes, setNotes] = useState<WrongAnswer[]>(() => {
    const saved = localStorage.getItem('study-notes');
    return saved ? JSON.parse(saved) : initialNotes;
  });
  const [activeTab, setActiveTab] = useState<'home' | 'plans' | 'timer' | 'stats' | 'notes' | 'exam' | 'settings'>('home');
  const [newPlan, setNewPlan] = useState({
    title: '',
    subject: '국어(화법과 작문)' as Subject,
    area: '',
    material: '',
    goal: '',
    estimatedHours: 1,
    startDate: getToday(),
    dueDate: getToday(),
    priority: '보통' as '높음' | '보통' | '낮음',
    recurring: false,
    memo: '',
  });
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerDeadline, setTimerDeadline] = useState<number | null>(null);
  const [timerMode, setTimerMode] = useState<'집중' | '휴식'>('집중');
  const [timerSubject, setTimerSubject] = useState<Subject>('국어(화법과 작문)');
  const [timerArea, setTimerArea] = useState('');
  const [timerMemo, setTimerMemo] = useState('');
  const [newNote, setNewNote] = useState({
    title: '',
    subject: '국어(화법과 작문)' as Subject,
    reason: '개념 부족',
    reviewDate: getToday(),
    memo: '',
  });
  const [newExam, setNewExam] = useState({
    name: '',
    examDate: getToday(),
    subjectResults: createDefaultSubjectResults(),
  });
  const [journal, setJournal] = useState<DailyJournal>({
    id: 'today',
    date: getToday(),
    mood: '3',
    focus: '3',
    condition: '3',
    wins: '',
    struggles: '',
    memo: '',
  });
  const [notificationSetting, setNotificationSetting] = useState<NotificationSetting>({ enabled: false, time: '21:00' });
  const [cloudStatus, setCloudStatus] = useState(isFirebaseConfigured ? '클라우드 저장 준비됨' : '데모 Firebase 설정으로 로컬 저장만 사용 중');
  const [statsRange, setStatsRange] = useState<'day' | 'week' | 'month'>('week');
  const [selectedSubject, setSelectedSubject] = useState<Subject | '전체'>('전체');

  useEffect(() => {
    localStorage.setItem('study-plans', JSON.stringify(plans));
  }, [plans]);
  useEffect(() => {
    localStorage.setItem('study-sessions', JSON.stringify(sessions));
  }, [sessions]);
  useEffect(() => {
    localStorage.setItem('study-exams', JSON.stringify(exams));
  }, [exams]);
  useEffect(() => {
    localStorage.setItem('study-notes', JSON.stringify(notes));
  }, [notes]);

  const finishTimer = useCallback(() => {
    const duration = Math.max(1, timerMinutes);
    const startedAt = timerStartedAt ?? new Date().toISOString();
    const session: StudySession = {
      id: crypto.randomUUID(),
      subject: timerSubject,
      area: timerArea,
      duration,
      date: getToday(),
      memo: timerMemo || `${timerMode} 시간 완료`,
      startTime: startedAt,
    };
    setSessions((prevSessions) => [session, ...prevSessions]);
    setTimeLeft(0);
    setIsRunning(false);
    setTimerStartedAt(null);
    setTimerDeadline(null);
    window.alert(`${timerMode} 시간이 종료되었습니다.`);
  }, [timerArea, timerMemo, timerMinutes, timerMode, timerStartedAt, timerSubject]);

  useEffect(() => {
    if (!isRunning || !timerDeadline) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        finishTimer();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [finishTimer, isRunning, timerDeadline]);

  useEffect(() => {
    if (!isRunning || !timerDeadline) return;

    const syncTimer = () => {
      const remaining = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        finishTimer();
      }
    };

    document.addEventListener('visibilitychange', syncTimer);
    window.addEventListener('focus', syncTimer);
    return () => {
      document.removeEventListener('visibilitychange', syncTimer);
      window.removeEventListener('focus', syncTimer);
    };
  }, [finishTimer, isRunning, timerDeadline]);

  useEffect(() => {
    localStorage.setItem('study-timer-state', JSON.stringify({
      isRunning,
      timeLeft,
      timerMinutes,
      timerMode,
      timerSubject,
      timerArea,
      timerMemo,
      timerStartedAt,
      timerDeadline,
    }));
  }, [isRunning, timeLeft, timerArea, timerDeadline, timerMemo, timerMinutes, timerMode, timerStartedAt, timerSubject]);

  useEffect(() => {
    if (!notificationSetting.enabled || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const [hours, minutes] = notificationSetting.time.split(':').map((value) => Number(value));
    let timeoutId: number | undefined;

    const scheduleNextAlarm = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);

      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      timeoutId = window.setTimeout(() => {
        new Notification('수능 플래너', {
          body: '오늘의 학습 계획을 다시 확인해 보세요.',
        });
        scheduleNextAlarm();
      }, next.getTime() - now.getTime());
    };

    scheduleNextAlarm();
    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [notificationSetting.enabled, notificationSetting.time]);

  const todayPlans = useMemo(() => plans.filter((plan) => plan.startDate <= getToday() && !plan.completed), [plans]);
  const completedCount = plans.filter((plan) => plan.completed).length;
  const totalHours = sessions.reduce((sum, session) => sum + session.duration, 0);
  const achievedRate = Math.round((completedCount / Math.max(plans.length, 1)) * 100);
  const weeklyHours = sessions.filter((s) => s.date >= '2026-07-27').reduce((sum, s) => sum + s.duration, 0);
  const latestExam = exams[0];
  const timerLabel = useMemo(() => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [timeLeft]);

  const addPlan = () => {
    if (!newPlan.title.trim()) return;
    const plan: StudyPlan = {
      id: crypto.randomUUID(),
      ...newPlan,
      completed: false,
      estimatedHours: Number(newPlan.estimatedHours),
    };
    setPlans((prev) => [plan, ...prev]);
    setNewPlan({
      title: '',
      subject: '국어(화법과 작문)',
      area: '',
      material: '',
      goal: '',
      estimatedHours: 1,
      startDate: getToday(),
      dueDate: getToday(),
      priority: '보통',
      recurring: false,
      memo: '',
    });
  };

  const deletePlan = (id: string) => {
    if (!window.confirm('이 계획을 삭제할까요?')) return;
    setPlans((prev) => prev.filter((plan) => plan.id !== id));
  };

  const togglePlan = (id: string) => {
    setPlans((prev) => prev.map((plan) => (plan.id === id ? { ...plan, completed: !plan.completed, completedDate: !plan.completed ? getToday() : undefined } : plan)));
  };

  const startTimer = () => {
    const durationSeconds = Math.max(60, timerMinutes * 60);
    const startedAt = new Date();
    setTimeLeft(durationSeconds);
    setTimerStartedAt(startedAt.toISOString());
    setTimerDeadline(startedAt.getTime() + durationSeconds * 1000);
    setIsRunning(true);
  };

  const pauseTimer = () => {
    setIsRunning(false);
    const remaining = timerDeadline ? Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000)) : timeLeft;
    setTimeLeft(remaining);
    setTimerDeadline(null);
    setTimerStartedAt(null);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(timerMinutes * 60);
    setTimerDeadline(null);
    setTimerStartedAt(null);
  };

  const addNote = () => {
    if (!newNote.title.trim()) return;
    const note: WrongAnswer = {
      id: crypto.randomUUID(),
      ...newNote,
      status: '미복습',
    };
    setNotes((prev) => [note, ...prev]);
    setNewNote({ title: '', subject: '국어(화법과 작문)', reason: '개념 부족', reviewDate: getToday(), memo: '' });
  };

  const deleteSession = (id: string) => {
    if (!window.confirm('이 공부 기록을 삭제할까요?')) return;
    setSessions((prev) => prev.filter((session) => session.id !== id));
  };

  const toggleNoteStatus = (id: string) => {
    setNotes((prev) => prev.map((note) => (note.id === id ? { ...note, status: note.status === '미복습' ? '복습 완료' : '미복습' } : note)));
  };

  const deleteNote = (id: string) => {
    if (!window.confirm('이 복습 항목을 삭제할까요?')) return;
    setNotes((prev) => prev.filter((note) => note.id !== id));
  };

  const addExam = () => {
    if (!newExam.name.trim()) return;
    const exam: MockExam = {
      id: crypto.randomUUID(),
      ...newExam,
      subjectResults: newExam.subjectResults.map((result) => ({
        ...result,
        score: Number(result.score),
        percentile: Number(result.percentile),
        correct: Number(result.correct),
        wrong: Number(result.wrong),
        skipped: Number(result.skipped),
      })),
    };
    setExams((prev) => [exam, ...prev]);
    setNewExam({ name: '', examDate: getToday(), subjectResults: createDefaultSubjectResults() });
  };

  const deleteExam = (id: string) => {
    if (!window.confirm('이 모의고사 기록을 삭제할까요?')) return;
    setExams((prev) => prev.filter((exam) => exam.id !== id));
  };

  const examAnalysis = useMemo(() => {
    if (!exams.length) return null;
    const latest = exams[0];
    const previous = exams[1];
    const latestAverage = Math.round(latest.subjectResults.reduce((sum, item) => sum + item.score, 0) / latest.subjectResults.length);
    const previousAverage = previous
      ? Math.round(previous.subjectResults.reduce((sum, item) => sum + item.score, 0) / previous.subjectResults.length)
      : latestAverage;
    const weakest = [...latest.subjectResults].sort((a, b) => a.score - b.score)[0];
    return {
      latestAverage,
      previousAverage,
      diff: latestAverage - previousAverage,
      weakest,
    };
  }, [exams]);

  const saveJournal = () => {
    const next = { ...journal, id: crypto.randomUUID(), date: getToday() };
    setJournal(next);
    alert('오늘의 학습 일지가 저장되었습니다.');
  };

  const saveToCloudStorage = async () => {
    const payload = { plans, sessions, exams, notes, journal, notificationSetting };
    const ok = await saveToCloud(payload);
    setCloudStatus(ok ? '클라우드 저장 완료' : '클라우드 저장 실패');
  };

  const loadFromCloudStorage = async () => {
    const data = await loadFromCloud();
    if (data.length > 0) {
      const latest = data[data.length - 1] as Record<string, unknown>;
      if (latest.plans) setPlans(latest.plans as StudyPlan[]);
      if (latest.sessions) setSessions(latest.sessions as StudySession[]);
      if (latest.exams) setExams(latest.exams as MockExam[]);
      if (latest.notes) setNotes(latest.notes as WrongAnswer[]);
      if (latest.journal) setJournal(latest.journal as DailyJournal);
      if (latest.notificationSetting) setNotificationSetting(latest.notificationSetting as NotificationSetting);
      setCloudStatus('클라우드 데이터 불러오기 완료');
    } else {
      setCloudStatus('클라우드에 저장된 데이터가 없습니다.');
    }
  };

  const totalStudyTime = Math.round(totalHours / 60);
  const todaySessions = useMemo(() => sessions.filter((session) => session.date === getToday()), [sessions]);
  const dailyTimetable = useMemo(() => {
    return todaySessions
      .map((session) => {
        const startDate = session.startTime ? new Date(session.startTime) : new Date(`${session.date}T09:00:00`);
        const endDate = new Date(startDate.getTime() + Math.max(1, session.duration) * 60_000);
        const formatTime = (value: Date) => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
        return {
          id: session.id,
          subject: session.subject,
          area: session.area,
          duration: session.duration,
          startTime: formatTime(startDate),
          endTime: formatTime(endDate),
          startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
        };
      })
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [todaySessions]);

  const trendData = useMemo(() => {
    const filteredSessions = selectedSubject === '전체' ? sessions : sessions.filter((session) => session.subject === selectedSubject);
    return buildTrendData(filteredSessions, statsRange);
  }, [sessions, selectedSubject, statsRange]);

  const subjectComparison = useMemo(() => buildSubjectComparison(sessions, subjectOptions), [sessions]);

  const subjectGrowth = useMemo(() => buildSubjectGrowth(sessions, subjectOptions), [sessions]);

  const selectedSubjectDetailData = useMemo(() => {
    if (selectedSubject === '전체') {
      return buildTrendData(sessions, statsRange);
    }
    return buildSubjectDetailData(sessions, selectedSubject, statsRange);
  }, [sessions, selectedSubject, statsRange]);

  const maxSubjectMinutes = Math.max(...subjectComparison.map((item) => item.minutes), 1);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('이 브라우저는 알림을 지원하지 않습니다.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setCloudStatus('브라우저 알림 권한이 허용되었습니다.');
    } else {
      setCloudStatus('브라우저 알림 권한이 거부되었습니다.');
    }
  };

  const sendTestNotification = () => {
    if (!('Notification' in window)) {
      alert('이 브라우저는 알림을 지원하지 않습니다.');
      return;
    }
    if (Notification.permission === 'granted') {
      new Notification('수능 플래너', { body: '알림 테스트가 정상적으로 실행되었습니다.' });
    } else {
      alert('알림 권한이 필요합니다.');
    }
  };

  const handleExportCsv = () => {
    const rows = [['date', 'subject', 'area', 'duration', 'memo']];
    sessions.forEach((session) => rows.push([session.date, session.subject, session.area, String(session.duration), session.memo]));
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'study-sessions.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const payload = { plans, sessions, exams, notes };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'study-planner-backup.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (parsed.plans) setPlans(parsed.plans);
          if (parsed.sessions) setSessions(parsed.sessions);
          if (parsed.exams) setExams(parsed.exams);
          if (parsed.notes) setNotes(parsed.notes);
          alert('백업 파일을 성공적으로 불러왔습니다.');
        } catch {
          alert('백업 파일 형식이 올바르지 않습니다.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleReset = () => {
    if (!window.confirm('모든 데이터를 초기화하시겠습니까?')) return;
    setPlans(initialPlans);
    setSessions(initialSessions);
    setExams(initialExams);
    setNotes(initialNotes);
    localStorage.removeItem('study-plans');
    localStorage.removeItem('study-sessions');
    localStorage.removeItem('study-exams');
    localStorage.removeItem('study-notes');
    alert('데이터를 초기화했습니다.');
  };

  return (
    <div className="container">
      <header className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="badge">수능 준비 플래너</div>
          <h1 style={{ margin: '8px 0 4px' }}>오늘의 학습을 한눈에</h1>
          <p style={{ margin: 0, color: '#6b7280' }}>개인용 학습 관리 앱으로 계획, 공부 시간, 오답, 성적을 함께 관리합니다.</p>
        </div>
        <div className="badge">{getToday()}</div>
      </header>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>오늘의 핵심 지표</h3>
          <div className="grid" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>오늘 계획</span>
              <strong>{todayPlans.length}개</strong>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>오늘 공부 시간</span>
              <strong>{totalStudyTime}시간</strong>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>달성률</span>
              <strong>{achievedRate}%</strong>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>이번 주 공부</span>
              <strong>{Math.round(weeklyHours / 60)}시간</strong>
            </div>
          </div>
        </div>
        <div className="card">
          <h3>빠른 실행</h3>
          <div className="row">
            <button onClick={() => setActiveTab('timer')} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #c7d2fe', background: '#eef2ff' }}>공부 시작</button>
            <button onClick={() => setActiveTab('plans')} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff' }}>학습 계획 추가</button>
            <button onClick={() => setActiveTab('notes')} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #fede2a', background: '#fefce8' }}>오답 등록</button>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        {(['home', 'plans', 'timer', 'stats', 'notes', 'exam', 'settings'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: activeTab === tab ? '#111827' : 'white', color: activeTab === tab ? 'white' : '#111827' }}>
            {tab === 'home' ? '홈' : tab === 'plans' ? '계획' : tab === 'timer' ? '타이머' : tab === 'stats' ? '통계' : tab === 'notes' ? '오답' : tab === 'exam' ? '모의고사' : '설정'}
          </button>
        ))}
      </div>

      {activeTab === 'home' && (
        <div className="grid">
          <div className="card">
            <h3>오늘 해야 할 학습</h3>
            {todayPlans.length === 0 ? <p>오늘의 계획이 없습니다.</p> : todayPlans.map((plan) => (
              <div key={plan.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span>{plan.title} ({plan.subject})</span>
                <button onClick={() => togglePlan(plan.id)} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #d1d5db', background: 'white' }}>{plan.completed ? '완료됨' : '완료 처리'}</button>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>최근 모의고사 성적</h3>
            {latestExam ? <div><strong>{latestExam.name}</strong><p>국어(화법과 작문) {latestExam.subjectResults[0].score}점 / 수학(확률과 통계) {latestExam.subjectResults[1].score}점</p></div> : <p>등록된 모의고사가 없습니다.</p>}
          </div>
        </div>
      )}

      {activeTab === 'plans' && (
        <div className="grid">
          <div className="card">
            <h3>학습 계획 추가</h3>
            <div className="grid grid-2">
              <input value={newPlan.title} onChange={(e) => setNewPlan({ ...newPlan, title: e.target.value })} placeholder="계획 제목" />
              <select value={newPlan.subject} onChange={(e) => setNewPlan({ ...newPlan, subject: e.target.value as Subject })}>
                {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
              <input value={newPlan.area} onChange={(e) => setNewPlan({ ...newPlan, area: e.target.value })} placeholder="영역/단원" />
              <input value={newPlan.material} onChange={(e) => setNewPlan({ ...newPlan, material: e.target.value })} placeholder="교재/강의" />
              <input value={newPlan.goal} onChange={(e) => setNewPlan({ ...newPlan, goal: e.target.value })} placeholder="목표 학습량" />
              <input type="number" value={newPlan.estimatedHours} onChange={(e) => setNewPlan({ ...newPlan, estimatedHours: Number(e.target.value) })} placeholder="예상시간" />
              <input type="date" value={newPlan.startDate} onChange={(e) => setNewPlan({ ...newPlan, startDate: e.target.value })} />
              <input type="date" value={newPlan.dueDate} onChange={(e) => setNewPlan({ ...newPlan, dueDate: e.target.value })} />
              <select value={newPlan.priority} onChange={(e) => setNewPlan({ ...newPlan, priority: e.target.value as '높음' | '보통' | '낮음' })}>
                <option value="높음">높음</option>
                <option value="보통">보통</option>
                <option value="낮음">낮음</option>
              </select>
              <label><input type="checkbox" checked={newPlan.recurring} onChange={(e) => setNewPlan({ ...newPlan, recurring: e.target.checked })} /> 반복 계획</label>
            </div>
            <textarea value={newPlan.memo} onChange={(e) => setNewPlan({ ...newPlan, memo: e.target.value })} placeholder="메모" style={{ width: '100%', marginTop: 12 }} />
            <button onClick={addPlan} style={{ marginTop: 12, padding: '8px 12px', borderRadius: 999, border: 'none', background: '#111827', color: 'white' }}>계획 추가</button>
          </div>
          <div className="card">
            <h3>계획 목록</h3>
            {plans.map((plan) => (
              <div key={plan.id} className="card" style={{ marginBottom: 8, background: '#fafafa' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{plan.title}</strong>
                  <span className="badge">{plan.priority}</span>
                </div>
                <p style={{ margin: '6px 0' }}>{plan.subject} · {plan.area} · {plan.material}</p>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{plan.completed ? '완료' : '진행중'}</span>
                  <div className="row">
                    <button onClick={() => togglePlan(plan.id)} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #d1d5db' }}>{plan.completed ? '미완료로 변경' : '완료 처리'}</button>
                    <button onClick={() => deletePlan(plan.id)} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #fecaca', color: '#b91c1c' }}>삭제</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'timer' && (
        <div className="grid">
          <div className="card">
            <h3>실제 공부 타이머</h3>
            <div style={{ fontSize: 56, textAlign: 'center', fontWeight: 700, margin: '12px 0' }}>{timerLabel}</div>
            <div className="grid grid-2">
              <select value={timerMode} onChange={(e) => setTimerMode(e.target.value as '집중' | '휴식')}>
                <option value="집중">집중</option>
                <option value="휴식">휴식</option>
              </select>
              <input type="number" min="1" value={timerMinutes} onChange={(e) => {
                const value = Number(e.target.value);
                setTimerMinutes(value);
                setTimeLeft(value * 60);
              }} />
              <select value={timerSubject} onChange={(e) => setTimerSubject(e.target.value as Subject)}>
                {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
              <input value={timerArea} onChange={(e) => setTimerArea(e.target.value)} placeholder="영역/단원" />
              <input value={timerMemo} onChange={(e) => setTimerMemo(e.target.value)} placeholder="학습 메모" />
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button onClick={startTimer} style={{ padding: '8px 12px', borderRadius: 999, border: 'none', background: '#4f46e5', color: 'white' }}>시작</button>
              <button onClick={pauseTimer} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: 'white' }}>일시정지</button>
              <button onClick={resetTimer} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: 'white' }}>초기화</button>
            </div>
          </div>
          <div className="card">
            <h3>오늘의 공부 기록</h3>
            {sessions.length === 0 ? <p>아직 기록된 공부 시간이 없습니다.</p> : sessions.map((session) => (
              <div key={session.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span>{session.subject} · {session.area} · {session.duration}분</span>
                <div className="row">
                  <span style={{ marginRight: 8 }}>{session.memo}</span>
                  <button onClick={() => deleteSession(session.id)} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #fecaca', color: '#b91c1c' }}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="grid">
          <div className="card">
            <h3>학습 통계 요약</h3>
            <div className="grid grid-2">
              <div className="card" style={{ background: '#f8fafc' }}>
                <p style={{ margin: 0, color: '#6b7280' }}>총 공부 시간</p>
                <h2 style={{ margin: '4px 0' }}>{totalStudyTime}시간</h2>
              </div>
              <div className="card" style={{ background: '#f8fafc' }}>
                <p style={{ margin: 0, color: '#6b7280' }}>이번 주</p>
                <h2 style={{ margin: '4px 0' }}>{Math.round(weeklyHours / 60)}시간</h2>
              </div>
            </div>
            <p style={{ margin: '8px 0 0' }}>완료한 계획 수: {completedCount}개</p>
            <p>계획 달성률: {achievedRate}%</p>
          </div>

          <div className="card stats-shell">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>공부 패턴 차트</h3>
              <div className="row">
                <button onClick={() => setStatsRange('day')} className={`pill-button ${statsRange === 'day' ? 'active' : ''}`}>일</button>
                <button onClick={() => setStatsRange('week')} className={`pill-button ${statsRange === 'week' ? 'active' : ''}`}>주</button>
                <button onClick={() => setStatsRange('month')} className={`pill-button ${statsRange === 'month' ? 'active' : ''}`}>월</button>
              </div>
            </div>
            <div className="row" style={{ marginBottom: 12 }}>
              <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value as Subject | '전체')} className="stats-select">
                <option value="전체">전체 과목</option>
                {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
            </div>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="minutes" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card" style={{ marginTop: 12, background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{selectedSubject === '전체' ? '전체 과목' : selectedSubject}</strong>
                <span className="badge">{selectedSubjectDetailData.reduce((sum, item) => sum + item.minutes, 0)}분</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>오늘의 시간표</h3>
            <div className="daily-timetable">
              {dailyTimetable.length === 0 ? (
                <p style={{ margin: 0, color: '#64748b' }}>오늘의 공부 기록이 아직 없습니다. 타이머로 세션을 시작해 보세요.</p>
              ) : dailyTimetable.map((item) => (
                <div key={item.id} className="study-block-card">
                  <div className="study-block-time">
                    <strong>{item.startTime}</strong>
                    <span>~ {item.endTime}</span>
                  </div>
                  <div className="study-block-info">
                    <div className="study-block-title">{item.subject}</div>
                    <div className="study-block-meta">{item.area || '영역 미기재'} · {item.duration}분</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>과목별 공부 시간 비교</h3>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={subjectComparison.map((item) => ({ label: item.subject, minutes: item.minutes }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" angle={-20} textAnchor="end" height={70} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="minutes" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3>과목별 성장 추세</h3>
            {subjectGrowth.map((item) => (
              <div key={item.subject} className="subject-growth-item" onClick={() => setSelectedSubject(item.subject as Subject)} style={{ marginTop: 10, padding: 10, borderRadius: 12, border: item.subject === selectedSubject ? '1px solid #c7d2fe' : '1px solid #e5e7eb', background: item.subject === selectedSubject ? '#f5f3ff' : 'white', cursor: 'pointer' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{item.subject}</span>
                  <strong>{item.recent}분 / 이전 {item.previous}분</strong>
                </div>
                <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ width: `${Math.min(100, (item.recent / Math.max(item.previous + 1, 1)) * 100)}%`, height: '100%', background: item.recent >= item.previous ? '#10b981' : '#ef4444', borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="grid">
          <div className="card">
            <h3>오답노트</h3>
            <div className="grid grid-2">
              <input value={newNote.title} onChange={(e) => setNewNote({ ...newNote, title: e.target.value })} placeholder="오답 제목" />
              <select value={newNote.subject} onChange={(e) => setNewNote({ ...newNote, subject: e.target.value as Subject })}>
                {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
              <select value={newNote.reason} onChange={(e) => setNewNote({ ...newNote, reason: e.target.value })}>
                {['개념 부족', '문제 해석 오류', '계산 실수', '시간 부족', '암기 부족', '조건 누락', '기타'].map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
              <input type="date" value={newNote.reviewDate} onChange={(e) => setNewNote({ ...newNote, reviewDate: e.target.value })} />
            </div>
            <textarea value={newNote.memo} onChange={(e) => setNewNote({ ...newNote, memo: e.target.value })} placeholder="메모" style={{ width: '100%', marginTop: 12 }} />
            <button onClick={addNote} style={{ marginTop: 12, padding: '8px 12px', borderRadius: 999, border: 'none', background: '#111827', color: 'white' }}>오답 등록</button>
          </div>
          <div className="card">
            <h3>복습 목록</h3>
            {notes.map((note) => (
              <div key={note.id} className="card" style={{ marginBottom: 8, background: '#fafafa' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{note.title}</strong>
                  <span className="badge">{note.status}</span>
                </div>
                <p style={{ margin: '6px 0' }}>{note.subject} · {note.reason}</p>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>다음 복습: {note.reviewDate}</span>
                  <div className="row">
                    <button onClick={() => toggleNoteStatus(note.id)} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #d1d5db', marginRight: 8 }}>{note.status === '미복습' ? '복습 완료' : '미복습으로 변경'}</button>
                    <button onClick={() => deleteNote(note.id)} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #fecaca', color: '#b91c1c' }}>삭제</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'exam' && (
        <div className="grid">
          <div className="card">
            <h3>모의고사 성적 입력</h3>
            <p style={{ margin: '0 0 8px', color: '#6b7280' }}>시험명: 모의고사 이름, 시험일: 실제 응시일, 원점수/등급/백분위는 성적 기준값입니다.</p>
            <input value={newExam.name} onChange={(e) => setNewExam({ ...newExam, name: e.target.value })} placeholder="시험명" style={{ width: '100%', marginBottom: 8 }} />
            <input type="date" value={newExam.examDate} onChange={(e) => setNewExam({ ...newExam, examDate: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
            {newExam.subjectResults.map((result, index) => (
              <div key={result.subject} className="card" style={{ marginBottom: 8, background: '#fafafa' }}>
                <strong>{result.subject}</strong>
                <div className="grid grid-2" style={{ marginTop: 8 }}>
                  <input type="number" value={result.score} onChange={(e) => {
                    const updated = [...newExam.subjectResults];
                    updated[index] = { ...updated[index], score: Number(e.target.value) };
                    setNewExam({ ...newExam, subjectResults: updated });
                  }} placeholder="원점수" />
                  <input value={result.grade} onChange={(e) => {
                    const updated = [...newExam.subjectResults];
                    updated[index] = { ...updated[index], grade: e.target.value };
                    setNewExam({ ...newExam, subjectResults: updated });
                  }} placeholder="등급" />
                  <input type="number" value={result.percentile} onChange={(e) => {
                    const updated = [...newExam.subjectResults];
                    updated[index] = { ...updated[index], percentile: Number(e.target.value) };
                    setNewExam({ ...newExam, subjectResults: updated });
                  }} placeholder="백분위" />
                  <input type="number" value={result.correct} onChange={(e) => {
                    const updated = [...newExam.subjectResults];
                    updated[index] = { ...updated[index], correct: Number(e.target.value) };
                    setNewExam({ ...newExam, subjectResults: updated });
                  }} placeholder="맞힌 문항 수" />
                </div>
              </div>
            ))}
            <button onClick={addExam} style={{ padding: '8px 12px', borderRadius: 999, border: 'none', background: '#111827', color: 'white' }}>시험 성적 저장</button>
          </div>
          <div className="card">
            <h3>성적 분석</h3>
            {examAnalysis ? (
              <div>
                <p>최근 시험 평균 점수: {examAnalysis.latestAverage}점</p>
                <p>이전 시험 대비 변화: {examAnalysis.diff >= 0 ? `+${examAnalysis.diff}` : examAnalysis.diff}점</p>
                <p>가장 낮은 과목: {examAnalysis.weakest.subject} ({examAnalysis.weakest.score}점)</p>
              </div>
            ) : <p>등록된 모의고사가 없습니다.</p>}
            {exams.map((exam) => (
              <div key={exam.id} className="card" style={{ marginTop: 8, background: '#fafafa' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{exam.name}</strong>
                  <button onClick={() => deleteExam(exam.id)} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #fecaca', color: '#b91c1c' }}>삭제</button>
                </div>
                <p style={{ margin: '6px 0' }}>{exam.examDate}</p>
                {exam.subjectResults.map((result) => (
                  <div key={`${exam.id}-${result.subject}`} className="row" style={{ justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>{result.subject}</span>
                    <strong>{result.score}점</strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid">
          <div className="card">
            <h3>설정 및 데이터 관리</h3>
            <p>학습 데이터를 안전하게 백업하고 복원할 수 있습니다.</p>
            <div className="row">
              <button onClick={handleExport} style={{ padding: '8px 12px', borderRadius: 999, border: 'none', background: '#111827', color: 'white' }}>백업 내보내기</button>
              <button onClick={handleImport} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: 'white' }}>백업 가져오기</button>
              <button onClick={handleReset} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c' }}>전체 초기화</button>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button onClick={saveToCloudStorage} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff' }}>클라우드 저장</button>
              <button onClick={loadFromCloudStorage} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>클라우드 불러오기</button>
              <button onClick={handleExportCsv} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: 'white' }}>CSV 내보내기</button>
            </div>
            <p style={{ marginTop: 8, color: '#6b7280' }}>{cloudStatus}</p>
          </div>
          <div className="card">
            <h3>알림 설정</h3>
            <label><input type="checkbox" checked={notificationSetting.enabled} onChange={(e) => setNotificationSetting({ ...notificationSetting, enabled: e.target.checked })} /> 알림 사용</label>
            <input type="time" value={notificationSetting.time} onChange={(e) => setNotificationSetting({ ...notificationSetting, time: e.target.value })} style={{ marginTop: 8, width: '100%' }} />
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={requestNotificationPermission} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: 'white' }}>알림 허용</button>
              <button onClick={sendTestNotification} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: 'white' }}>알림 테스트</button>
            </div>
            <p style={{ marginTop: 8, color: '#6b7280' }}>브라우저 알림을 허용하면 세팅된 시간에 기초 알림을 받을 수 있습니다.</p>
          </div>
          <div className="card">
            <h3>오늘의 학습 일지</h3>
            <input type="number" min="1" max="5" value={journal.mood} onChange={(e) => setJournal({ ...journal, mood: e.target.value })} placeholder="만족도(1~5)" />
            <input type="number" min="1" max="5" value={journal.focus} onChange={(e) => setJournal({ ...journal, focus: e.target.value })} placeholder="집중도(1~5)" />
            <input type="number" min="1" max="5" value={journal.condition} onChange={(e) => setJournal({ ...journal, condition: e.target.value })} placeholder="컨디션(1~5)" />
            <textarea value={journal.wins} onChange={(e) => setJournal({ ...journal, wins: e.target.value })} placeholder="오늘 잘한 점" style={{ width: '100%', marginTop: 8 }} />
            <textarea value={journal.struggles} onChange={(e) => setJournal({ ...journal, struggles: e.target.value })} placeholder="부족했던 점" style={{ width: '100%', marginTop: 8 }} />
            <textarea value={journal.memo} onChange={(e) => setJournal({ ...journal, memo: e.target.value })} placeholder="메모" style={{ width: '100%', marginTop: 8 }} />
            <button onClick={saveJournal} style={{ marginTop: 8, padding: '8px 12px', borderRadius: 999, border: 'none', background: '#111827', color: 'white' }}>일지 저장</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

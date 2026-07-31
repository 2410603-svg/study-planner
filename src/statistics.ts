export type TrendRange = 'day' | 'week' | 'month';

export type TrendPoint = {
  label: string;
  minutes: number;
};

export type SubjectTrendItem = {
  subject: string;
  minutes: number;
};

export type SubjectGrowthItem = {
  subject: string;
  recent: number;
  previous: number;
};

type StudySessionLike = {
  date: string;
  duration: number;
  subject: string;
  memo?: string;
};

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const toDateKey = (value: string) => {
  const date = parseDateOnly(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getToday = (today: Date) => {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const buildTrendData = (sessions: StudySessionLike[], range: TrendRange, today: Date = new Date()): TrendPoint[] => {
  if (range === 'day') {
    return Array.from({ length: 6 }, (_, index) => {
      const startHour = index * 4;
      const endHour = startHour + 4;
      const label = `${String(startHour).padStart(2, '0')}:00~${String(endHour).padStart(2, '0')}:00`;
      const targetDate = getToday(today);
      const minutes = sessions
        .filter((session) => session.date === targetDate)
        .reduce((sum, session) => {
          const sessionDate = parseDateOnly(session.date);
          const hour = sessionDate.getHours();
          return sum + (hour >= startHour && hour < endHour ? session.duration : 0);
        }, 0);
      return { label, minutes };
    });
  }

  if (range === 'week') {
    return Array.from({ length: 7 }, (_, index) => {
      const current = new Date(today);
      current.setDate(today.getDate() - (6 - index));
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      const label = `${current.getMonth() + 1}/${current.getDate()}`;
      const minutes = sessions
        .filter((session) => toDateKey(session.date) === key)
        .reduce((sum, session) => sum + session.duration, 0);
      return { label, minutes };
    });
  }

  const buckets = 6;
  return Array.from({ length: buckets }, (_, index) => {
    const end = new Date(today);
    end.setDate(today.getDate() - (buckets - 1 - index) * 5);
    const start = new Date(end);
    start.setDate(end.getDate() - 4);
    const label = `${start.getMonth() + 1}/${start.getDate()}~${end.getMonth() + 1}/${end.getDate()}`;
    const minutes = sessions.reduce((sum, session) => {
      const sessionDate = parseDateOnly(session.date);
      if (sessionDate >= start && sessionDate <= end) {
        return sum + session.duration;
      }
      return sum;
    }, 0);
    return { label, minutes };
  });
};

export const buildSubjectComparison = (sessions: StudySessionLike[], subjectOptions: string[]): SubjectTrendItem[] =>
  subjectOptions
    .map((subject) => ({
      subject,
      minutes: sessions.filter((session) => session.subject === subject).reduce((sum, item) => sum + item.duration, 0),
    }))
    .sort((a, b) => b.minutes - a.minutes);

export const buildSubjectGrowth = (sessions: StudySessionLike[], subjectOptions: string[]): SubjectGrowthItem[] =>
  subjectOptions.map((subject) => {
    const subjectSessions = sessions.filter((session) => session.subject === subject);
    const recent = subjectSessions.reduce((sum, item) => sum + item.duration, 0);
    const previous = Math.max(0, recent - 30);
    return { subject, recent, previous };
  });

export const buildSubjectDetailData = (sessions: StudySessionLike[], subject: string, range: TrendRange, today: Date = new Date()): TrendPoint[] => {
  const subjectSessions = sessions.filter((session) => session.subject === subject);
  return buildTrendData(subjectSessions, range, today);
};

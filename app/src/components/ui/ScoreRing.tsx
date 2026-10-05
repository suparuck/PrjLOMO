import type { CSSProperties } from 'react'

/** คะแนนคนขับ: ≥85 เขียว, ≥70 เหลือง, ต่ำกว่านั้นแดง — score = null คือยังไม่มีคะแนน (ยังไม่มีทริป) */
export function ScoreRing({ score }: { score: number | null }) {
  if (score === null) return <div className="ring" style={{ '--v': 0, '--c': 'var(--line-2)' } as CSSProperties} data-v="–" />
  const color = score >= 85 ? 'var(--green)' : score >= 70 ? 'var(--amber)' : 'var(--red)'
  return <div className="ring" style={{ '--v': score, '--c': color } as CSSProperties} data-v={score} />
}

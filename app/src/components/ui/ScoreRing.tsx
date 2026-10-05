import type { CSSProperties } from 'react'

/** คะแนนคนขับ: ≥85 เขียว, ≥70 เหลือง, ต่ำกว่านั้นแดง */
export function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? 'var(--green)' : score >= 70 ? 'var(--amber)' : 'var(--red)'
  return <div className="ring" style={{ '--v': score, '--c': color } as CSSProperties} data-v={score} />
}

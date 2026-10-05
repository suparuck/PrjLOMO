import type { ReactNode } from 'react'

export function Card({ children, className = '', flush = false }: { children: ReactNode; className?: string; flush?: boolean }) {
  return <div className={`card${flush ? ' flush' : ''} ${className}`.trim()}>{children}</div>
}

export function CardHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="card-h">
      <div>
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </div>
      {actions}
    </div>
  )
}

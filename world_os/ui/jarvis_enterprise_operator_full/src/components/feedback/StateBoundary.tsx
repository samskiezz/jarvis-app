
import React from 'react';

export function LoadingState({label='Loading'}:{label?:string}) {
  return <div className="empty-state">{label}...</div>;
}
export function EmptyState({title, actionLabel, onAction}:{title:string; actionLabel?:string; onAction?:()=>void}) {
  return <div className="empty-state"><h3>{title}</h3>{actionLabel && <button className="button primary" onClick={onAction}>{actionLabel}</button>}</div>;
}
export function ErrorState({title, detail, onRetry}:{title:string; detail?:string; onRetry?:()=>void}) {
  return <div className="error-state"><h3>{title}</h3><p>{detail}</p>{onRetry && <button className="button danger" onClick={onRetry}>Retry</button>}</div>;
}

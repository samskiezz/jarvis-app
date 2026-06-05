
import React, {useMemo, useState} from 'react';

export type Column = { key: string; label: string; width?: number; render?: (value:any,row:any)=>React.ReactNode };
export type RowAction = { id:string; label:string; enabled:(row:any)=>boolean; onClick:(row:any)=>void; kind?:'primary'|'danger'|'secondary' };

export function DataGridPro({columns, rows, primaryKey, actions=[]}:{columns:Column[]; rows:any[]; primaryKey:string; actions?:RowAction[]}) {
  const [filter,setFilter] = useState('');
  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, filter]);

  if (!rows.length) return <div className="empty-state">No records loaded for this view.</div>;

  return <div style={{height:'100%', display:'flex', flexDirection:'column'}}>
    <div style={{padding:10, borderBottom:'1px solid rgba(120,210,255,.15)'}}>
      <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter table..." style={{width:'100%', padding:10, borderRadius:10, background:'#07101D', color:'#E8F2FF', border:'1px solid rgba(120,210,255,.2)'}}/>
    </div>
    <div style={{overflow:'auto'}}>
      <table className="table">
        <thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{actions.length ? <th>Actions</th> : null}</tr></thead>
        <tbody>{filtered.map(row => <tr key={row[primaryKey]}>
          {columns.map(c => <td key={c.key}>{c.render ? c.render(row[c.key], row) : String(row[c.key] ?? '')}</td>)}
          {actions.length ? <td>{actions.map(a => <button key={a.id} className={'button '+(a.kind||'secondary')} disabled={!a.enabled(row)} onClick={()=>a.onClick(row)}>{a.label}</button>)}</td> : null}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

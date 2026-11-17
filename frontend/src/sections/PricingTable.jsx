import { useState } from 'react';
import { pricing } from '../content/site.js';

/** Fee tables in tabs. `only` limits which tabs show (the home page shows fewer). */
export default function PricingTable({ only = null }) {
  const tabs = only ? pricing.tabs.filter((t) => only.includes(t.id)) : pricing.tabs;
  const [tab, setTab] = useState(tabs[0].id);
  const current = tabs.find((t) => t.id === tab);
  return (
    <div className="pricing">
      <div className="pill-tabs" role="tablist" aria-label="Fee categories">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`ptab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="ppanel"
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="ppanel" role="tabpanel" aria-labelledby={`ptab-${tab}`} key={tab} className="pricing__panel">
        <h3>{current.label}</h3>
        <table className="fee-table">
          <tbody>
            {current.rows.map(([item, fee]) => (
              <tr key={item}>
                <th scope="row">{item}</th>
                <td>{fee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">{pricing.footnote}</p>
    </div>
  );
}

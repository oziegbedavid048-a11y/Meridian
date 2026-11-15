import { Link } from 'react-router-dom';

/** Inner-page hero: brand block with an optional photo cut on a diagonal, then a breadcrumb. */
export function PageHero({ title, text, image, children, crumb, parent }) {
  return (
    <>
      <section className={`page-hero ${image ? 'page-hero--photo' : ''}`}>
        {image && (
          <div className="page-hero__photo" aria-hidden="true">
            <img src={image} alt="" />
          </div>
        )}
        <div className="container page-hero__inner">
          <h1>{title}</h1>
          {text && <p className="page-hero__text">{text}</p>}
          {children}
        </div>
      </section>
      <nav className="crumbs" aria-label="Breadcrumb">
        <div className="container">
          <Link to="/">Home</Link> <span aria-hidden="true">/</span>{' '}
          {parent && (
            <>
              <Link to={parent[1]}>{parent[0]}</Link> <span aria-hidden="true">/</span>{' '}
            </>
          )}
          <span aria-current="page">{crumb || title}</span>
        </div>
      </nav>
    </>
  );
}

/** "On this page" pill links. `links` is a list of [label, '#id']. */
export function OnThisPage({ links }) {
  return (
    <nav className="on-page" aria-label="On this page">
      <div className="container on-page__inner">
        <span>On this page</span>
        {links.map(([label, hash]) => (
          <a key={hash} href={hash} className="pill-link">{label}</a>
        ))}
      </div>
    </nav>
  );
}

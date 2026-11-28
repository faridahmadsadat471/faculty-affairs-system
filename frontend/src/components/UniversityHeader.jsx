import Icon from './Icon.jsx';

export default function UniversityHeader() {
  return (
    <header className="university-header">
      <div className="header-inner flex items-center justify-between gap-4">
        <a href="/" className="university-brand flex items-center gap-3" aria-label="بوست پوهنتون، اصلي مخ">
          <img src="/brand/bost.jpg" alt="د بوست پوهنتون لوګو" width="56" height="56" />
          <div>
            <p className="university-name">بوست پوهنتون</p>
            <p className="english-brand" lang="en" dir="ltr">BOST UNIVERSITY</p>
          </div>
        </a>
        <a className="website-link flex items-center gap-2" href="https://bost.edu.af/" target="_blank" rel="noreferrer">
          <Icon name="globe" size={19} />
          <span>د پوهنتون وېبپاڼه</span>
        </a>
      </div>
    </header>
  );
}

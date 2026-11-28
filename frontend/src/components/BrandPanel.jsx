import Icon from './Icon.jsx';

export default function BrandPanel() {
  return (
    <aside className="brand-panel" aria-labelledby="brand-title">
      <img className="campus-photo" src="/brand/bost-campus.jpeg" alt="د بوست پوهنتون ودانۍ" />
      <div className="brand-shade" />
      <div className="brand-content relative">
        <div className="brand-eyebrow flex items-center gap-3"><span /> د استادانو د چارو ریاست</div>
        <h1 id="brand-title">د علمي کادر چارې،<br /><span>په یوه منظم ځای کې.</span></h1>
        <p className="brand-description">د استادانو د سوابقو، علمي ترفیعاتو او اداري اسنادو د مدیریت ګډ سیستم.</p>
      </div>
      <div className="brand-bottom relative">
        <div className="brand-features grid grid-cols-3 gap-3">
          <div><Icon name="book" /><span>د استادانو سوابق</span></div>
          <div><Icon name="award" /><span>علمي ترفیعات</span></div>
          <div><Icon name="file" /><span>قراردادونه</span></div>
        </div>
        <p className="brand-caption">بوست پوهنتون <span aria-hidden="true">/</span> د استادانو د چارو مدیریت سیستم</p>
      </div>
    </aside>
  );
}

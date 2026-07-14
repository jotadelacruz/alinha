import markCream from '../assets/brand/mark-cream.png';
import markInk from '../assets/brand/mark-ink.png';

export function AuthBrand() {
  return (
    <div className="auth-brand">
      <img src={markInk} alt="" className="auth-brand-mark auth-brand-mark-light" />
      <img src={markCream} alt="" className="auth-brand-mark auth-brand-mark-dark" />
      <span className="auth-brand-name">Alinha</span>
    </div>
  );
}

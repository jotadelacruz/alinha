import { AuthBrand } from '../components/AuthBrand';
import BillingPanel from '../components/BillingPanel';
import { useAuth } from '../context/AuthContext';

export default function AssinaturaPage() {
  const { signOut } = useAuth();

  return (
    <div className="auth-screen">
      <div className="auth-form">
        <AuthBrand />
        <p>Assinatura</p>
        <BillingPanel />
        <button type="button" className="link" onClick={() => signOut()}>
          Sair
        </button>
      </div>
    </div>
  );
}

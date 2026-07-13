# Templates de e-mail (Supabase Auth) — PT-BR

Cole cada bloco HTML no respectivo template em:
Supabase Dashboard → Authentication → Email Templates

Não altere as variáveis entre `{{ }}` — o Supabase substitui pelo valor real na hora do envio.

---

## 1. Confirm signup (confirmação de cadastro)

**Subject:**
```
Confirme seu cadastro no Alinha
```

**Message body:**
```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1c1b1a;">
  <h1 style="color: #1e4b43; font-size: 22px; margin-bottom: 4px;">Alinha</h1>
  <p style="font-size: 14px; color: #6b6b6b; margin-top: 0;">Gestão inteligente para atendimentos</p>

  <h2 style="font-size: 18px; margin-top: 24px;">Confirme seu e-mail</h2>
  <p style="font-size: 14px; line-height: 1.6;">
    Recebemos um cadastro no Alinha com este e-mail. Para ativar sua conta, clique no botão abaixo:
  </p>

  <p style="text-align: center; margin: 32px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="background: #1e4b43; color: #f0ede6; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: bold; display: inline-block;">
      Confirmar cadastro
    </a>
  </p>

  <p style="font-size: 12.5px; color: #6b6b6b; line-height: 1.6;">
    Se você não criou uma conta no Alinha, pode ignorar este e-mail com segurança.
  </p>
</div>
```

---

## 2. Reset Password (redefinição de senha)

**Subject:**
```
Redefinir sua senha do Alinha
```

**Message body:**
```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1c1b1a;">
  <h1 style="color: #1e4b43; font-size: 22px; margin-bottom: 4px;">Alinha</h1>
  <p style="font-size: 14px; color: #6b6b6b; margin-top: 0;">Gestão inteligente para atendimentos</p>

  <h2 style="font-size: 18px; margin-top: 24px;">Redefinir senha</h2>
  <p style="font-size: 14px; line-height: 1.6;">
    Recebemos uma solicitação para redefinir a senha da sua conta no Alinha. Clique no botão abaixo para escolher uma nova senha:
  </p>

  <p style="text-align: center; margin: 32px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="background: #1e4b43; color: #f0ede6; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: bold; display: inline-block;">
      Redefinir senha
    </a>
  </p>

  <p style="font-size: 12.5px; color: #6b6b6b; line-height: 1.6;">
    Se você não solicitou essa alteração, pode ignorar este e-mail — sua senha atual continua válida.
  </p>
</div>
```

---

## Observação

O link gerado pelo `{{ .ConfirmationURL }}` do template "Reset Password" já aponta para a URL configurada em
`resetPasswordForEmail` no código do frontend (`redirectTo: .../reset-password`), então ele cai direto na tela
"Definir nova senha" do Alinha depois de confirmado.

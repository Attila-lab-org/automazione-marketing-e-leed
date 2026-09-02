import { buildUnsubscribeUrls } from './unsubscribe-token';
import { resolveAppUrl } from '@/lib/app-url';

export function appendEmailComplianceFooter(
  html: string,
  workspaceId: string,
  leadId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (html.includes('data-atti-lab-privacy')) return html;
  const { pageUrl } = buildUnsubscribeUrls(workspaceId, leadId, env);
  const privacyUrl = `${resolveAppUrl(env)}/privacy`;
  return `${html}
<div data-atti-lab-privacy="true" style="margin-top:24px;padding-top:16px;border-top:1px solid #e7e5e4;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;color:#78716c">
  Atti-Lab ha usato informazioni professionali pubblicamente visibili per creare questa proposta dimostrativa. Non vendiamo questi dati; possono essere trattati dai soli fornitori tecnici necessari al servizio. La demo viene eliminata automaticamente dopo 36 ore.
  <a href="${privacyUrl}" style="color:#57534e">Informativa privacy</a> ·
  <a href="${pageUrl}" style="color:#57534e">Non voglio ricevere altre email</a>
</div>`;
}

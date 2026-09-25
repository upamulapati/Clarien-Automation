import { AccountPage } from './AccountPage';

/**
 * HPSP / HPR / HACM page wrapper for the statement generation defect scenario.
 * Extends AccountPage to reuse Finacle login, menu, function and tab helpers.
 */
export class HpspPage extends AccountPage {
  async getBodyText(): Promise<string> {
    try {
      const finwFrame = this.getFinwFrame();
      return (await finwFrame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }

  async getHprBodyText(): Promise<string> {
    return this.getBodyText();
  }

  async hasFatalOrCoreError(): Promise<boolean> {
    const text = (await this.getBodyText()).toLowerCase();
    return /fatal|core dump|internal server error/.test(text);
  }

  async selectPrintAccountStatement(optionText: string): Promise<boolean> {
    try {
      const finwFrame = this.getFinwFrame();
      const result = await finwFrame.evaluate(({ option }) => {
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const targetNorm = normalize(option);
        const labelMatch = (text: string) => {
          const n = normalize(text);
          return n.includes('acstatement') || n.includes('accountstatement') || n.includes('printaccountstatement');
        };

        const labels = Array.from(document.querySelectorAll('td, th, label, span, div'));
        const labelEl = labels.find(el => labelMatch((el as any).textContent || ''));
        if (!labelEl) return false;

        const parent = (labelEl as HTMLElement).closest('tr, td, div, fieldset, form');
        if (!parent) return false;

        const select = parent.querySelector('select') as HTMLSelectElement | null;
        if (!select) return false;

        const target = Array.from(select.options).find(o => normalize(o.text).includes(targetNorm) || normalize(o.value).includes(targetNorm));
        if (target) {
          select.selectedIndex = target.index;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      }, { option: optionText });

      if (result) {
        console.log(`Selected A/c. Statement option: ${optionText}`);
        return true;
      }
    } catch (e) {
      console.log(`selectPrintAccountStatement failed: ${e}`);
    }

    return (
      (await this.selectOptionByLabel('A/c. Statement', optionText)) ||
      (await this.selectOptionByLabel('Account Statement', optionText)) ||
      (await this.selectOptionByLabel('Print account statement', optionText))
    );
  }

  async selectRelatedPartyPrintStatementFlag(value: string): Promise<boolean> {
    try {
      const finwFrame = this.getFinwFrame();
      const result = await finwFrame.evaluate(({ flag }) => {
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const flagNorm = normalize(flag);
        const labels = Array.from(document.querySelectorAll('td, th, label, span, div'));
        const labelEl = labels.find(el => {
          const n = normalize((el as any).textContent || '');
          return (
            n.includes('printstatementflag') ||
            (n.includes('print') && n.includes('statement') && n.includes('flag')) ||
            (n.includes('passsheet') && n.includes('relatedparty')) ||
            (n.includes('enablepasssheet') && n.includes('relatedparty'))
          );
        });
        if (!labelEl) return false;

        const parent = (labelEl as HTMLElement).closest('tr, td, div, fieldset, form');
        if (!parent) return false;

        const radios = Array.from(parent.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
        const target = radios.find(r => {
          if (normalize(r.value) === flagNorm || normalize(r.value).includes('y') && flagNorm === 'y') return true;
          const assoc = r.labels ? Array.from(r.labels).map(l => (l as any).textContent || '').join(' ') : '';
          const forLabel = (r.id && document.querySelector(`label[for="${r.id}"]`) as any)?.textContent || '';
          const assocNorm = normalize(assoc);
          const labelNorm = normalize(forLabel);
          return (
            assocNorm.includes(flagNorm) ||
            (flagNorm === 'y' && (assocNorm.includes('yes') || assocNorm.includes('y'))) ||
            (flagNorm === 'n' && (assocNorm.includes('no') || assocNorm.includes('n'))) ||
            labelNorm.includes(flagNorm) ||
            (flagNorm === 'y' && (labelNorm.includes('yes') || labelNorm.includes('y'))) ||
            (flagNorm === 'n' && (labelNorm.includes('no') || labelNorm.includes('n')))
          );
        });

        if (target) {
          target.checked = true;
          target.dispatchEvent(new Event('change', { bubbles: true }));
          target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return true;
        }

        // Some screens use a dropdown for the flag
        const select = parent.querySelector('select') as HTMLSelectElement | null;
        if (select) {
          const option = Array.from(select.options).find(o => {
            const oNorm = normalize(o.text) || normalize(o.value);
            return oNorm.includes(flagNorm) ||
              (flagNorm === 'y' && (oNorm.includes('yes') || oNorm.includes('y'))) ||
              (flagNorm === 'n' && (oNorm.includes('no') || oNorm.includes('n')));
          });
          if (option) {
            select.selectedIndex = option.index;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, { flag: value });

      if (result) {
        console.log(`Selected related party print statement flag: ${value}`);
        return true;
      }
    } catch (e) {
      console.log(`selectRelatedPartyPrintStatementFlag failed: ${e}`);
    }

    return this.selectOptionByLabel('Print statement flag', value);
  }

  async enterHpspFromAccount(accountId: string): Promise<boolean> {
    return (
      (await this.fillByLabel('From A/c', accountId)) ||
      (await this.fillByLabel('From A/c. ID', accountId)) ||
      (await this.fillByLabel('From A/c Id', accountId)) ||
      (await this.setTextByCandidates(['low_acct_num', 'psp.low_acct_num', 'foracid'], accountId, 'From A/c'))
    );
  }

  async enterHpspToAccount(accountId: string): Promise<boolean> {
    return (
      (await this.fillByLabel('To A/c', accountId)) ||
      (await this.fillByLabel('To A/c. ID', accountId)) ||
      (await this.fillByLabel('To A/c Id', accountId)) ||
      (await this.setTextByCandidates(['high_acct_num', 'psp.high_acct_num', 'foracid'], accountId, 'To A/c'))
    );
  }

  async enterHpspFromDate(date: string): Promise<boolean> {
    return (
      (await this.fillByLabel('Period From', date)) ||
      (await this.fillByLabel('From Date', date)) ||
      (await this.fillByLabel('From Tran Date', date)) ||
      (await this.setTextByCandidates(['low_tran_date_ui', 'low_tran_date'], date, 'Period From'))
    );
  }

  async enterHpspToDate(date: string): Promise<boolean> {
    return (
      (await this.fillByLabel('Period To', date)) ||
      (await this.fillByLabel('To Date', date)) ||
      (await this.fillByLabel('To Tran Date', date)) ||
      (await this.setTextByCandidates(['high_tran_date_ui', 'high_tran_date'], date, 'Period To'))
    );
  }

  private async selectStatementSize(size: string): Promise<boolean> {
    try {
      const finwFrame = this.getFinwFrame();
      const result = await finwFrame.evaluate(({ target }) => {
        const targetNorm = (target as string).toLowerCase();
        const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
        const statementRadios = radios.filter(r => {
          const group = r.getAttribute('name') || '';
          const title = (r.getAttribute('title') || '').toLowerCase();
          return group.toLowerCase().includes('statement') || title.includes('statement') || r.id.toLowerCase().includes('statement');
        });

        const candidates = statementRadios.length ? statementRadios : radios;
        const targetRadio = candidates.find(r => {
          if (r.value.toLowerCase() === targetNorm) return true;
          const assoc = r.labels ? Array.from(r.labels).map(l => (l as any).textContent || '').join(' ') : '';
          const forLabel = (r.id && document.querySelector(`label[for="${r.id}"]`) as any)?.textContent || '';
          return assoc.toLowerCase().includes(targetNorm) || forLabel.toLowerCase().includes(targetNorm);
        });

        if (targetRadio) {
          targetRadio.checked = true;
          targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
          targetRadio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return true;
        }
        return false;
      }, { target: size });

      if (result) {
        console.log(`Selected statement size: ${size}`);
        return true;
      }
    } catch (e) {
      console.log(`selectStatementSize failed: ${e}`);
    }

    console.log(`Could not select statement size: ${size}`);
    return false;
  }

  async clickHpspGo(): Promise<void> {
    await this.selectStatementSize('Full');
    const finwFrame = this.getFinwFrame();
    const clicked = await finwFrame.evaluate(() => {
      const all = Array.from(document.querySelectorAll('input, button, a, input[type="image"]'));
      const el = all.find(e => {
        const val = ((e as HTMLInputElement).value || '').toLowerCase();
        const txt = (e.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const title = ((e as HTMLElement).title || '').toLowerCase();
        const name = ((e as any).name || '').toLowerCase();
        return val.includes('go') || val.includes('submit') || txt.includes('go') || txt.includes('submit') || title.includes('go') || name.includes('go') || name.includes('submit');
      });
      if (el) {
        (el as HTMLElement).scrollIntoView({ block: 'center' });
        (el as HTMLElement).click();
        return el.tagName + (el.id ? '#' + el.id : '') + ' ' + ((el as HTMLInputElement).value || el.textContent || '');
      }
      return null;
    });
    if (clicked) {
      console.log(`Clicked HPSP Go via JS: ${clicked}`);
    } else {
      console.log('HPSP Go element not found via JS');
      const goBtn = finwFrame.locator('input[value="Go" i], button:has-text("Go"), a:has-text("Go"), input[value="Submit" i]').last();
      if (await goBtn.count() > 0) {
        await goBtn.click({ timeout: 15000, force: true });
      }
    }
    await this.page.waitForTimeout(5000);
  }

  async clickHprGo(): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const clicked = await finwFrame.evaluate(() => {
      const all = Array.from(document.querySelectorAll('input, button, a, input[type="image"]'));
      const exactGo = (e: Element) => {
        const val = ((e as HTMLInputElement).value || '').toLowerCase().trim();
        const txt = (e.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        return val === 'go' || txt === 'go';
      };
      const anyGo = (e: Element) => {
        const val = ((e as HTMLInputElement).value || '').toLowerCase();
        const txt = (e.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const title = ((e as HTMLElement).title || '').toLowerCase();
        const name = ((e as any).name || '').toLowerCase();
        return val.includes('go') || val.includes('submit') || txt.includes('go') || txt.includes('submit') || title.includes('go') || name.includes('go') || name.includes('submit');
      };
      const el = all.find(exactGo) || all.find(anyGo);
      if (el) {
        (el as HTMLElement).scrollIntoView({ block: 'center' });
        (el as HTMLElement).click();
        (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return el.tagName + (el.id ? '#' + el.id : '') + ' ' + ((el as HTMLInputElement).value || el.textContent || '');
      }
      return null;
    });
    if (clicked) {
      console.log(`Clicked HPR Go via JS: ${clicked}`);
    } else {
      console.log('HPR Go element not found via JS');
      const goBtn = finwFrame.locator('input[value="Go" i], button:has-text("Go"), a:has-text("Go"), input[value="Submit" i]').last();
      if (await goBtn.count() > 0) {
        await goBtn.click({ timeout: 15000, force: true });
      }
    }
    await this.page.waitForTimeout(5000);
  }

  async isNoAccountsFetchedErrorDisplayed(): Promise<boolean> {
    const body = (await this.getHprBodyText()).toLowerCase();
    const status = (await this.getStatusMessage() || '').toLowerCase();
    const text = `${body} ${status}`;
    return /no (?:records|accounts|data) (?:were )?fetched|no (?:records|data) found|nothing to display|not found|fer000238/.test(text);
  }
}

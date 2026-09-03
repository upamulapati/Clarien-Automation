import { Page } from '@playwright/test';
import { AppConfig, getMakerConfig } from '../../config/crmTestData';
import { CrmRetailModificationPage } from './crmRetailModificationPage';

// =====================================================================
// CrmCorporateModificationPage — page object for the Corporate CIF
// modification maker workflow. Reuses the now-CIF-type-agnostic
// CrmRetailModificationPage with cifType set to 'corporate' and data
// sourced from crmTestData.json (corporate.modification).
// =====================================================================

export class CrmCorporateModificationPage extends CrmRetailModificationPage {
  constructor(page: Page, config: AppConfig = getMakerConfig(), lastDialogMessages: string[] = []) {
    super(page, config, lastDialogMessages, 'corporate');
  }
}

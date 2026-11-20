# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: Finacle\currentaccount\currentaccountmodification.spec.ts >> Current Account Modification - 4600000111 >> HACM - data-driven current account modification - 4600000111
- Location: tests\Finacle\currentaccount\currentaccountmodification.spec.ts:492:9

# Error details

```
Error: Submit/Verify/Authorize button not found in any frame
```

# Page snapshot

```yaml
- iframe [active] [ref=e3]: </DIV> </body>:
  - generic [ref=f1e1]:
    - generic [ref=f1e2]:
      - text: "User: FINACLETEST5"
      - img [ref=f1e3]
      - text: "Calendar:"
      - combobox "Calendar:" [ref=f1e4]:
        - option "Buddha"
        - option "Gregorian" [selected]
        - option "Hijri"
      - img [ref=f1e5]
      - generic [ref=f1e6]: "Time Zone: ADT"
      - link "Change Time Zone:" [ref=f1e7] [cursor=pointer]:
        - /url: javascript:changeTimeZone();
        - img "Change Time Zone:" [ref=f1e8]
      - text: "Solution:"
      - combobox "Solution:" [ref=f1e9]:
        - option "Select"
        - option "CRM"
        - option "CoreServer" [selected]
        - option "FIPAdministrator"
        - option "Workflow Inbox"
        - option "FININFRA"
      - img [ref=f1e10]
      - link "Change Credentials" [ref=f1e11] [cursor=pointer]:
        - /url: javascript:showChangeCreds()
        - img "Change Credentials" [ref=f1e12]
      - img [ref=f1e13]
      - link "Send Feedback" [ref=f1e14] [cursor=pointer]:
        - /url: javascript:feedback();
        - img "Send Feedback" [ref=f1e15]
      - img [ref=f1e16]
      - link "Logout" [ref=f1e17] [cursor=pointer]:
        - /url: javascript:logout("N", "INFENG");
        - img "Logout" [ref=f1e18]
    - generic [ref=f1e21]:
      - table [ref=f1e23]:
        - rowgroup [ref=f1e24]:
          - row "Bank Logo" [ref=f1e25]:
            - cell "Bank Logo" [ref=f1e26]:
              - img "Bank Logo" [ref=f1e27]
            - cell [ref=f1e28]
      - generic [ref=f1e32]:
        - combobox [ref=f1e33]:
          - generic [ref=f1e34]:
            - textbox "Menu Searcher; Enter keyword" [ref=f1e35]
            - generic: Enter keyword
        - button "Go" [ref=f1e36] [cursor=pointer]
      - img "Finacle Logo" [ref=f1e38]
      - list [ref=f1e41]:
        - listitem "Favorites" [ref=f1e42]:
          - link "Favorites Icon" [ref=f1e43] [cursor=pointer]:
            - /url: "#"
            - generic "Favorites Icon" [ref=f1e44]
    - iframe [active] [ref=f1e46]:
      - iframe [active] [ref=f5e3]:
        - generic [ref=f7e2]:
          - table [ref=f7e3]:
            - rowgroup [ref=f7e4]:
              - row "Home Show Memo Pad Exit Background CCY Converter 01 October, 2026 100 01" [ref=f7e5]:
                - cell "Home Show Memo Pad Exit Background CCY Converter 01 October, 2026 100 01" [ref=f7e6]:
                  - table [ref=f7e7]:
                    - rowgroup [ref=f7e8]:
                      - row:
                        - cell
                      - row "Home Show Memo Pad Exit Background CCY Converter 01 October, 2026 100 01" [ref=f7e9]:
                        - cell [ref=f7e10]:
                          - img [ref=f7e11]
                        - cell [ref=f7e12]:
                          - img [ref=f7e13]
                        - cell "Home" [ref=f7e14]:
                          - link "Home" [ref=f7e15] [cursor=pointer]:
                            - /url: javascript:fnBacktoLandingPage();
                        - cell [ref=f7e16]:
                          - img [ref=f7e17]
                        - cell [ref=f7e18]:
                          - img [ref=f7e19]
                        - cell "Show Memo Pad" [ref=f7e20]:
                          - link "Show Memo Pad" [ref=f7e21] [cursor=pointer]:
                            - /url: javascript:fnMenuHdr('showmemopad','false');
                        - cell [ref=f7e22]:
                          - img [ref=f7e23]
                        - cell "Exit Background" [ref=f7e24]:
                          - link "Exit Background" [ref=f7e25] [cursor=pointer]:
                            - /url: javascript:exitBgMenu();
                        - cell [ref=f7e26]:
                          - img [ref=f7e27]
                        - cell "CCY Converter" [ref=f7e28]:
                          - link "CCY Converter" [ref=f7e29] [cursor=pointer]:
                            - /url: javascript:showCrncyConverter();
                        - cell [ref=f7e30]:
                          - img [ref=f7e31]
                        - cell "01 October, 2026" [ref=f7e32]
                        - cell [ref=f7e33]:
                          - img [ref=f7e34]
                        - cell "100" [ref=f7e35]
                        - cell [ref=f7e36]:
                          - img [ref=f7e37]
                        - cell "01" [ref=f7e38]
                        - cell [ref=f7e39]:
                          - img [ref=f7e40]
                - cell [ref=f7e41]
              - row
          - generic [ref=f7e42]:
            - table [ref=f7e43]:
              - rowgroup [ref=f7e44]:
                - row "Background Menu" [ref=f7e45]:
                  - cell "Background Menu" [ref=f7e46]
            - table [ref=f7e47]:
              - rowgroup [ref=f7e48]:
                - row "Calendar Table Inquiry Search Network Directory" [ref=f7e49]:
                  - cell "Calendar Table Inquiry Search Network Directory" [ref=f7e50]:
                    - table [ref=f7e51]:
                      - rowgroup [ref=f7e52]:
                        - row "Calendar Table Inquiry Search Network Directory" [ref=f7e53]:
                          - cell "Calendar Table Inquiry Search Network Directory" [ref=f7e54]:
                            - table [ref=f7e55]:
                              - rowgroup [ref=f7e56]:
                                - row "Calendar Table Inquiry Search Network Directory" [ref=f7e57]:
                                  - cell "Calendar Table Inquiry Search Network Directory" [ref=f7e58]:
                                    - table [ref=f7e59]:
                                      - rowgroup [ref=f7e60]:
                                        - row "Calendar Table Inquiry" [ref=f7e61]:
                                          - cell "Calendar Table Inquiry" [ref=f7e62]:
                                            - link "Calendar Table Inquiry" [ref=f7e63] [cursor=pointer]:
                                              - /url: javascript:showbgmenu('ctm/ctm_ctrl.jsp','HCTI');
                                        - row "Search Network Directory" [ref=f7e64]:
                                          - cell "Search Network Directory" [ref=f7e65]:
                                            - link "Search Network Directory" [ref=f7e66] [cursor=pointer]:
                                              - /url: javascript:showbgmenu('snd/snd_ctrl.jsp','SND');
                                        - row [ref=f7e67]:
                                          - cell [ref=f7e68]
    - alert [ref=f1e49]
```

# Test source

```ts
  4944 |       'form input[type="button"][name*="Submit" i], form input[type="submit"][name*="Submit" i], ' +
  4945 |       'form button:has-text("Submit"),' +
  4946 |       'form input[type="submit"][value*="Verify" i], form input[type="button"][value*="Verify" i], ' +
  4947 |       'form input[type="submit"][value*="Authorise" i], form input[type="button"][value*="Authorise" i], ' +
  4948 |       'form input[type="submit"][value*="Authorize" i], form input[type="button"][value*="Authorize" i], ' +
  4949 |       'form button:has-text("Verify"), form button:has-text("Authorise"), form button:has-text("Authorize")';
  4950 | 
  4951 |     // Fallback covers buttons, images and links that could be the real Submit/Verify/Authorize.
  4952 |     // Top menu items are avoided by selecting the candidate that is lowest on the page.
  4953 |     const fallbackSelector =
  4954 |       '#Submit, #submit, ' +
  4955 |       'input[type="submit"], input[type="button"], button, input[type="image"], ' +
  4956 |       'a:has-text("Submit"), a:has-text("Verify"), a:has-text("Authorise"), a:has-text("Authorize"), ' +
  4957 |       'div:has-text("Submit"), div:has-text("Verify"), div:has-text("Authorise"), div:has-text("Authorize"), ' +
  4958 |       'span:has-text("Submit"), span:has-text("Verify"), span:has-text("Authorise"), span:has-text("Authorize"), ' +
  4959 |       'td:has-text("Submit"), td:has-text("Verify"), td:has-text("Authorise"), td:has-text("Authorize"), ' +
  4960 |       'li:has-text("Submit"), li:has-text("Verify"), li:has-text("Authorise"), li:has-text("Authorize")';
  4961 | 
  4962 |     const matchesActionLabel = (label: string) => /submit|verify|authori[sz]e/i.test(label);
  4963 | 
  4964 |     const isContentFrame = (frame: Frame): boolean => {
  4965 |       const name = (frame.name() || '').toLowerCase();
  4966 |       const url = (frame.url() || '').toLowerCase();
  4967 |       return !name.includes('fininfra') && !name.includes('login') && !url.includes('helprenderer') && !url.includes('/help/');
  4968 |     };
  4969 | 
  4970 |     const clickLowestMatch = async (frame: Frame, selector: string): Promise<boolean> => {
  4971 |       try {
  4972 |         if (frame.isDetached()) return false;
  4973 |         const btns = frame.locator(selector);
  4974 |         const count = await btns.count().catch(() => 0);
  4975 |         console.log(`[clickLowestMatch] frame=${frame.name() || 'main'} url=${frame.url()} selectorCount=${count}`);
  4976 |         const candidates: { btn: Locator; y: number; label: string }[] = [];
  4977 | 
  4978 |         for (let i = 0; i < count; i++) {
  4979 |           const btn = btns.nth(i);
  4980 |           if (!(await btn.isVisible().catch(() => false))) continue;
  4981 |           const bb = await btn.boundingBox().catch(() => null);
  4982 |           if (!bb) continue;
  4983 | 
  4984 |           const value = (await btn.getAttribute('value').catch(() => '')) || '';
  4985 |           const alt = (await btn.getAttribute('alt').catch(() => '')) || '';
  4986 |           const title = (await btn.getAttribute('title').catch(() => '')) || '';
  4987 |           const text = (await btn.textContent().catch(() => '')) || '';
  4988 |           const label = `${value} ${alt} ${title} ${text}`.trim();
  4989 | 
  4990 |           if (matchesActionLabel(label)) {
  4991 |             candidates.push({ btn, y: bb.y, label: label.slice(0, 80) });
  4992 |           }
  4993 |         }
  4994 | 
  4995 |         if (candidates.length === 0) return false;
  4996 | 
  4997 |         console.log(`Found ${candidates.length} action candidates: ${candidates.map(c => `${c.label} (y=${c.y})`).join('; ')}`);
  4998 | 
  4999 |         // Click the candidate that is lowest on the page (largest top y), which avoids top navigation.
  5000 |         candidates.sort((a, b) => b.y - a.y);
  5001 |         const chosen = candidates[0];
  5002 |         console.log(`Clicking best action candidate (lowest): label='${chosen.label}', y=${chosen.y}`);
  5003 |         await chosen.btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  5004 |         await chosen.btn.click({ timeout: 15000 });
  5005 |         return true;
  5006 |       } catch (e) {
  5007 |         console.log(`clickLowestMatch failed in frame: ${(e as Error).message}`);
  5008 |       }
  5009 |       return false;
  5010 |     };
  5011 | 
  5012 |     const deadline = Date.now() + 15000;
  5013 |     while (Date.now() < deadline) {
  5014 |       const frames: Frame[] = [];
  5015 |       try {
  5016 |         frames.push(this.getFinwFrame());
  5017 |       } catch {}
  5018 | 
  5019 |       for (const p of this.page.context().pages()) {
  5020 |         if (p.isClosed()) continue;
  5021 |         for (const f of p.frames()) {
  5022 |           if (!f.isDetached() && isContentFrame(f)) {
  5023 |             frames.push(f);
  5024 |           }
  5025 |         }
  5026 |       }
  5027 | 
  5028 |       const uniqueFrames = [...new Set(frames)];
  5029 |       for (const frame of uniqueFrames) {
  5030 |         if (await clickLowestMatch(frame, submitInFormSelector)) {
  5031 |           await this.page.waitForTimeout(3000);
  5032 |           console.log(`Clicked Submit/Verify/Authorize button in form, frame '${frame.name() || 'main'}'`);
  5033 |           return;
  5034 |         }
  5035 |         if (await clickLowestMatch(frame, fallbackSelector)) {
  5036 |           await this.page.waitForTimeout(3000);
  5037 |           console.log(`Clicked Submit/Verify/Authorize button via fallback, frame '${frame.name() || 'main'}'`);
  5038 |           return;
  5039 |         }
  5040 |       }
  5041 |       await this.page.waitForTimeout(500);
  5042 |     }
  5043 | 
> 5044 |     throw new Error('Submit/Verify/Authorize button not found in any frame');
       |           ^ Error: Submit/Verify/Authorize button not found in any frame
  5045 |   }
  5046 | 
  5047 |   // ============ HACM (Customer Account Maintenance) Methods ============
  5048 |   // Finds the <select> on the screen that contains an option matching the
  5049 |   // desired function text (e.g. "Modify" / "M - Modify"), regardless of its id.
  5050 |   private async findFunctionDropdown(value: string): Promise<Locator | null> {
  5051 |     let finwFrame: Frame;
  5052 |     try {
  5053 |       finwFrame = this.getFinwFrame();
  5054 |     } catch {
  5055 |       return null;
  5056 |     }
  5057 | 
  5058 |     // Prefer the known id if present
  5059 |     const known = finwFrame.locator('#templateFunction');
  5060 |     if (await known.count() > 0) {
  5061 |       return known;
  5062 |     }
  5063 | 
  5064 |     const selects = finwFrame.locator('select');
  5065 |     const count = await selects.count();
  5066 |     const normalizedValue = value.toLowerCase().replace(/\s*-\s*/g, '-');
  5067 |     for (let i = 0; i < count; i++) {
  5068 |       const opts = await selects.nth(i).locator('option').allTextContents();
  5069 |       if (opts.some(o => o.toLowerCase().replace(/\s*-\s*/g, '-').includes(normalizedValue))) {
  5070 |         return selects.nth(i);
  5071 |       }
  5072 |     }
  5073 |     return null;
  5074 |   }
  5075 | 
  5076 |   async selectFunction(value: string): Promise<boolean> {
  5077 |     try {
  5078 |       const deadline = Date.now() + 30000;
  5079 |       let dropdown = await this.findFunctionDropdown(value);
  5080 |       while (!dropdown && Date.now() < deadline) {
  5081 |         await this.page.waitForTimeout(500);
  5082 |         dropdown = await this.findFunctionDropdown(value);
  5083 |       }
  5084 |       if (!dropdown) {
  5085 |         console.log(`Function dropdown not found for '${value}'`);
  5086 |         return false;
  5087 |       }
  5088 |       await this.capturePreActionEvidence(`Before function: ${value}`);
  5089 |       await dropdown.waitFor({ state: 'visible', timeout: 15000 });
  5090 | 
  5091 |       // Log available options for diagnostics
  5092 |       const options = await dropdown.locator('option').allTextContents();
  5093 |       console.log(`Function dropdown options: ${JSON.stringify(options)}`);
  5094 | 
  5095 |       // Find the option whose visible text matches the desired function
  5096 |       // e.g. value "Modify" matches "M - Modify". Then select by its leading
  5097 |       // code value ("M"), which is the most reliable for native <select>.
  5098 |       const normalizedValue = value.toLowerCase().replace(/\s*-\s*/g, '-');
  5099 |       const matchLabel = options.find(o => o.toLowerCase().replace(/\s*-\s*/g, '-').includes(normalizedValue));
  5100 |       if (matchLabel) {
  5101 |         const code = matchLabel.split('-')[0].trim();
  5102 |         try {
  5103 |           await dropdown.selectOption(code);
  5104 |         } catch {
  5105 |           await dropdown.selectOption({ label: matchLabel });
  5106 |         }
  5107 |       } else {
  5108 |         await dropdown.selectOption(value);
  5109 |       }
  5110 |       await this.page.waitForTimeout(1000);
  5111 |       console.log(`Selected function: ${value}`);
  5112 |       return true;
  5113 |     } catch (e) {
  5114 |       console.log(`Could not select function '${value}': ${e}`);
  5115 |       return false;
  5116 |     }
  5117 |   }
  5118 | 
  5119 |   // Enters the account id on the HACM screen. Tries known field ids, then
  5120 |   // falls back to the first visible text input on the form.
  5121 |   async enterHacmAccountId(accountId: string) {
  5122 |     try {
  5123 |       const finwFrame = this.getFinwFrame();
  5124 |       const candidates = ['#tempForacid', '#acctId', '#acctNum', '#acctNo', '#foracid'];
  5125 |       for (const sel of candidates) {
  5126 |         const field = finwFrame.locator(sel);
  5127 |         if (await field.count() > 0 && await field.first().isVisible().catch(() => false)) {
  5128 |           await field.first().fill(accountId);
  5129 |           await field.first().press('Tab');
  5130 |           await this.page.waitForTimeout(2000);
  5131 |           console.log(`Entered HACM account ID in ${sel}: ${accountId}`);
  5132 |           return;
  5133 |         }
  5134 |       }
  5135 |       // Fallback: first visible text input
  5136 |       const textInput = finwFrame.locator('input[type="text"]:visible').first();
  5137 |       await textInput.fill(accountId);
  5138 |       await textInput.press('Tab');
  5139 |       await this.page.waitForTimeout(2000);
  5140 |       console.log(`Entered HACM account ID in first visible text input: ${accountId}`);
  5141 |     } catch (e) {
  5142 |       console.log(`Could not enter HACM account ID, skipping: ${e}`);
  5143 |     }
  5144 |   }
```
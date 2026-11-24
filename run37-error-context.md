# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: Finacle\currentaccount\currentaccountmodification.spec.ts >> Current Account Modification - 4600000111 >> HACM - data-driven current account modification - 4600000111
- Location: tests\Finacle\currentaccount\currentaccountmodification.spec.ts:497:9

# Error details

```
Error: Expected successful modification but got: No success or error message appeared after submission.

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
          - generic [ref=f7e3]:
            - table [ref=f7e4]:
              - rowgroup [ref=f7e5]:
                - row "Home Menu Show Memo Pad Background Menu CCY Converter 01 October, 2026 100 01" [ref=f7e6]:
                  - cell "Home Menu Show Memo Pad Background Menu CCY Converter 01 October, 2026 100 01" [ref=f7e7]:
                    - table [ref=f7e8]:
                      - rowgroup [ref=f7e9]:
                        - row:
                          - cell
                        - row "Home Menu Show Memo Pad Background Menu CCY Converter 01 October, 2026 100 01" [ref=f7e10]:
                          - cell [ref=f7e11]:
                            - img [ref=f7e12] [cursor=pointer]
                          - cell [ref=f7e13]:
                            - img [ref=f7e14] [cursor=pointer]
                          - cell "Home" [ref=f7e15]:
                            - link "Home" [ref=f7e16] [cursor=pointer]:
                              - /url: javascript:fnBacktoLandingPage();
                          - cell [ref=f7e17]:
                            - img [ref=f7e18] [cursor=pointer]
                          - cell [ref=f7e19]:
                            - img [ref=f7e20] [cursor=pointer]
                          - cell "Menu" [ref=f7e21]:
                            - link "Menu" [ref=f7e22] [cursor=pointer]:
                              - /url: javascript:fnHtmlMenu();
                          - cell [ref=f7e23]:
                            - img [ref=f7e24] [cursor=pointer]
                          - cell "Show Memo Pad" [ref=f7e25]:
                            - link "Show Memo Pad" [ref=f7e26] [cursor=pointer]:
                              - /url: javascript:fnMenuHdr('showmemopad','false');
                          - cell [ref=f7e27]:
                            - img [ref=f7e28] [cursor=pointer]
                          - cell "Background Menu" [ref=f7e29]:
                            - link "Background Menu" [ref=f7e30] [cursor=pointer]:
                              - /url: javascript:fnMenuHdr('showbglist','true');
                          - cell [ref=f7e31]:
                            - img [ref=f7e32] [cursor=pointer]
                          - cell "CCY Converter" [ref=f7e33]:
                            - link "CCY Converter" [ref=f7e34] [cursor=pointer]:
                              - /url: javascript:showCrncyConverter();
                          - cell [ref=f7e35]:
                            - img [ref=f7e36] [cursor=pointer]
                          - cell "01 October, 2026" [ref=f7e37]
                          - cell [ref=f7e38]:
                            - img [ref=f7e39] [cursor=pointer]
                          - cell "100" [ref=f7e40]
                          - cell [ref=f7e41]:
                            - img [ref=f7e42] [cursor=pointer]
                          - cell "01" [ref=f7e43]
                          - cell [ref=f7e44]:
                            - img [ref=f7e45] [cursor=pointer]
                  - cell [ref=f7e46]
                - row
            - table [ref=f7e47]:
              - rowgroup [ref=f7e48]:
                - row "Customer A/cs Maintenance" [ref=f7e49]:
                  - cell "Customer A/cs Maintenance" [ref=f7e50]
            - table [ref=f7e51]:
              - rowgroup [ref=f7e52]:
                - row "Function * Select A/c. ID * Signature" [ref=f7e53]:
                  - cell "Function * Select A/c. ID * Signature" [ref=f7e54]:
                    - table [ref=f7e55]:
                      - rowgroup [ref=f7e56]:
                        - row "Function * Select A/c. ID * Signature" [ref=f7e57]:
                          - cell "Function * Select A/c. ID * Signature" [ref=f7e58]:
                            - table [ref=f7e59]:
                              - rowgroup [ref=f7e60]:
                                - row "Function * Select A/c. ID * Signature" [ref=f7e61]:
                                  - cell "Function * Select A/c. ID * Signature" [ref=f7e62]:
                                    - table [ref=f7e63]:
                                      - rowgroup [ref=f7e64]:
                                        - row "Function * Select A/c. ID * Signature" [ref=f7e65]:
                                          - cell "Function * Select A/c. ID * Signature" [ref=f7e66]:
                                            - table [ref=f7e67]:
                                              - rowgroup [ref=f7e68]:
                                                - row [ref=f7e69]:
                                                  - cell [ref=f7e70]
                                                  - cell [ref=f7e71]
                                                  - cell [ref=f7e72]
                                                  - cell [ref=f7e73]
                                                  - cell [ref=f7e74]:
                                                    - table [ref=f7e75]:
                                                      - rowgroup [ref=f7e76]:
                                                        - row [ref=f7e77]:
                                                          - cell [ref=f7e78]
                                                          - cell [ref=f7e79]:
                                                            - link:
                                                              - /url: javascript:showHelpFile('hacmcrit_help.htm');
                                                              - img [ref=f7e80] [cursor=pointer]
                                                - row "Function * Select" [ref=f7e81]:
                                                  - cell "Function *" [ref=f7e82]
                                                  - cell "Select" [ref=f7e83]:
                                                    - combobox [active] [ref=f7e84]:
                                                      - option "Select" [selected]
                                                      - option "I - Inquire"
                                                      - option "M - Modify"
                                                      - option "V - Verify"
                                                      - option "X - Cancel"
                                                  - cell [ref=f7e85]
                                                  - cell [ref=f7e86]
                                                  - cell [ref=f7e87]
                                                - row "A/c. ID * Signature" [ref=f7e88]:
                                                  - cell "A/c. ID *" [ref=f7e89]
                                                  - cell "Signature" [ref=f7e90]:
                                                    - textbox [ref=f7e91]
                                                    - link [ref=f7e92] [cursor=pointer]:
                                                      - /url: JavaScript:fnAccountIDList(objForm.mode)
                                                      - img [ref=f7e93]
                                                    - link [ref=f7e94] [cursor=pointer]:
                                                      - /url: javascript:fnExplodeAcct(objForm.acctNum)
                                                      - img [ref=f7e95]
                                                    - link "Signature" [ref=f7e96] [cursor=pointer]:
                                                      - /url: javascript:showFinacleSignature();
                                                      - img "Signature" [ref=f7e97]
                                                    - textbox [disabled] [ref=f7e98]
                                                    - textbox [disabled] [ref=f7e99]
                                                    - textbox [disabled] [ref=f7e100]
                                                - row [ref=f7e101]:
                                                  - cell [ref=f7e102]
          - generic [ref=f7e103]:
            - button "Go" [ref=f7e104] [cursor=pointer]
            - button "Clear" [ref=f7e105] [cursor=pointer]
    - alert [ref=f1e49]
```

# Test source

```ts
  758 |             if (crInfo?.id) await accountPage.clearFieldById(crInfo.id);
  759 |           }
  760 |           if (drFlag.includes('original')) {
  761 |             const drInfo = await accountPage.getFieldValueByLabel('Interest Debit A/c. ID', 0);
  762 |             if (drInfo?.id) await accountPage.clearFieldById(drInfo.id);
  763 |           }
  764 |         }
  765 | 
  766 |         if (tab === 'Related Party' && relatedPartyRows.length > 0) {
  767 |           for (const rpRow of relatedPartyRows) {
  768 |             const hasNext = await accountPage.goToNextRelatedPartyRecord();
  769 |             if (!hasNext) {
  770 |               await accountPage.clickRelatedPartyAdd();
  771 |             }
  772 |             await page.waitForTimeout(2000);
  773 | 
  774 |             if (rpRow.relationType?.trim()) {
  775 |               await accountPage.selectRelationType(rpRow.relationType);
  776 |             }
  777 |             if (rpRow.relatedPartyCifId?.trim()) {
  778 |               await accountPage.enterRelatedPartyCif(rpRow.relatedPartyCifId);
  779 |             }
  780 | 
  781 |             const rpFieldsToProcess = Object.keys(rpRow).filter(
  782 |               (k) =>
  783 |                 !IDENTITY_FIELDS.includes(k) &&
  784 |                 !k.startsWith('__EMPTY') &&
  785 |                 !k.startsWith('_') &&
  786 |                 rpRow[k] !== '' &&
  787 |                 k !== 'relationType' &&
  788 |                 k !== 'relatedPartyCifId' &&
  789 |                 fieldTabMap(k) === 'Related Party'
  790 |             );
  791 | 
  792 |             for (const rpField of rpFieldsToProcess) {
  793 |               const rpExpected = rpRow[rpField];
  794 |               let set = false;
  795 |               for (const rpLabel of candidateLabels(rpField)) {
  796 |                 set = await accountPage.setFieldValueByLabel(rpLabel, rpExpected);
  797 |                 if (set) break;
  798 |               }
  799 |               if (!set) {
  800 |                 throw new Error('Failed to set related party field "' + rpField + '" to "' + rpExpected + '"');
  801 |               }
  802 |             }
  803 |           }
  804 |         }
  805 | 
  806 |         const tabUpdated = results.filter((r) => r.status === 'Updated' && tabFields.includes(r.field));
  807 |         if (tabUpdated.length > 0) {
  808 |           console.log('[Tab Verify] ' + tab + ' - re-checking ' + tabUpdated.length + ' updated field(s)');
  809 |           for (const r of tabUpdated) {
  810 |             const matched = fieldLabels.get(r.field);
  811 |             if (!matched) continue;
  812 |             const verifyInfo = await accountPage.getFieldValueByLabel(matched, FIELD_CONTROL_INDEX[r.field], FIELD_CONTROL_ID[r.field]);
  813 |             const actual = verifyInfo ? verifyInfo.value : r.actual;
  814 |             if (!valuesMatch(r.expected, actual)) {
  815 |               console.log('[Tab Verify] ' + r.field + ' mismatch: expected "' + r.expected + '", got "' + actual + '"');
  816 |               r.status = 'Failed';
  817 |               r.actual = actual;
  818 |             } else {
  819 |               console.log('[Tab Verify] ' + r.field + ' = "' + actual + '" OK');
  820 |             }
  821 |           }
  822 |         }
  823 | 
  824 |         const tabFailures = results.filter((r) => r.status === 'Failed' && tabFields.includes(r.field));
  825 |         const tabNotFound = results.filter((r) => r.status === 'NotFound' && tabFields.includes(r.field));
  826 |         if (tabFailures.length > 0) {
  827 |           console.error('[Tab ' + tab + ' failures] ' + JSON.stringify(tabFailures));
  828 |         }
  829 |         if (tabNotFound.length > 0) {
  830 |           console.warn('[Tab ' + tab + ' not found] ' + JSON.stringify(tabNotFound));
  831 |         }
  832 |         expect(tabFailures, 'Tab "' + tab + '" has failed fields: ' + JSON.stringify(tabFailures)).toHaveLength(0);
  833 |       }
  834 | 
  835 |       console.log('=== Current Account Modification Field Results ===');
  836 |       console.log(JSON.stringify(results, null, 2));
  837 | 
  838 |       const failures = results.filter((r) => r.status === 'Failed');
  839 |       const notFound = results.filter((r) => r.status === 'NotFound');
  840 |       const updates = results.filter((r) => r.status === 'Updated');
  841 | 
  842 |       if (failures.length > 0) {
  843 |         console.error('[Failed] ' + JSON.stringify(failures));
  844 |       }
  845 |       if (notFound.length > 0) {
  846 |         console.warn('[NotFound] ' + JSON.stringify(notFound));
  847 |       }
  848 | 
  849 |       expect(failures, 'One or more fields failed to be updated: ' + JSON.stringify(failures)).toHaveLength(0);
  850 | 
  851 |       if (updates.length > 0) {
  852 |         console.log('Submitting modification for ' + updates.length + ' updated field(s)...');
  853 |         await accountPage.submitForm();
  854 | 
  855 |         const result = await accountPage.verifyAccountCreated();
  856 |         console.log('Exact result message:', result.message);
  857 | 
> 858 |         expect(result.success, 'Expected successful modification but got: ' + result.message).toBe(true);
      |                                                                                               ^ Error: Expected successful modification but got: No success or error message appeared after submission.
  859 |         expect(result.message).toBeTruthy();
  860 |         expect(result.message).toMatch(/(?:successfully|posted|completed|verified|authorized|authorised|approved|modified|deleted|created|added|disbursed|generated)/i);
  861 |       } else {
  862 |         console.log('No fields required modification; skipping submit.');
  863 |       }
  864 | 
  865 |       await homePage.logout();
  866 |     });
  867 |   });
  868 | }
  869 | 
  870 | // === STRICT ASSERTIONS INJECTION ===
  871 | test.afterEach(async ({ page }) => {
  872 |   const html = (await page.content()).toLowerCase();
  873 |   expect(html).not.toMatch(/core dump|internal server error/);
  874 | });
  875 | 
```
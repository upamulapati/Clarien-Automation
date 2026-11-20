# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: Finacle\currentaccount\currentaccountcreation.spec.ts >> HOAACCA - create current account (CAREG-BMD-0)
- Location: tests\Finacle\currentaccount\currentaccountcreation.spec.ts:147:7

# Error details

```
Error: Expected success but got: null

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
      - iframe [active] [ref=f4e3]:
        - generic [ref=f6e2]:
          - generic [ref=f6e3]:
            - table [ref=f6e4]:
              - rowgroup [ref=f6e5]:
                - row "Home Menu Show Memo Pad Background Menu CCY Converter 01 October, 2026 100 01" [ref=f6e6]:
                  - cell "Home Menu Show Memo Pad Background Menu CCY Converter 01 October, 2026 100 01" [ref=f6e7]:
                    - table [ref=f6e8]:
                      - rowgroup [ref=f6e9]:
                        - row:
                          - cell
                        - row "Home Menu Show Memo Pad Background Menu CCY Converter 01 October, 2026 100 01" [ref=f6e10]:
                          - cell [ref=f6e11]:
                            - img [ref=f6e12] [cursor=pointer]
                          - cell [ref=f6e13]:
                            - img [ref=f6e14] [cursor=pointer]
                          - cell "Home" [ref=f6e15]:
                            - link "Home" [ref=f6e16] [cursor=pointer]:
                              - /url: javascript:fnBacktoLandingPage();
                          - cell [ref=f6e17]:
                            - img [ref=f6e18] [cursor=pointer]
                          - cell [ref=f6e19]:
                            - img [ref=f6e20] [cursor=pointer]
                          - cell "Menu" [ref=f6e21]:
                            - link "Menu" [ref=f6e22] [cursor=pointer]:
                              - /url: javascript:fnHtmlMenu();
                          - cell [ref=f6e23]:
                            - img [ref=f6e24] [cursor=pointer]
                          - cell "Show Memo Pad" [ref=f6e25]:
                            - link "Show Memo Pad" [ref=f6e26] [cursor=pointer]:
                              - /url: javascript:fnMenuHdr('showmemopad','false');
                          - cell [ref=f6e27]:
                            - img [ref=f6e28] [cursor=pointer]
                          - cell "Background Menu" [ref=f6e29]:
                            - link "Background Menu" [ref=f6e30] [cursor=pointer]:
                              - /url: javascript:fnMenuHdr('showbglist','true');
                          - cell [ref=f6e31]:
                            - img [ref=f6e32] [cursor=pointer]
                          - cell "CCY Converter" [ref=f6e33]:
                            - link "CCY Converter" [ref=f6e34] [cursor=pointer]:
                              - /url: javascript:showCrncyConverter();
                          - cell [ref=f6e35]:
                            - img [ref=f6e36] [cursor=pointer]
                          - cell "01 October, 2026" [ref=f6e37]
                          - cell [ref=f6e38]:
                            - img [ref=f6e39] [cursor=pointer]
                          - cell "100" [ref=f6e40]
                          - cell [ref=f6e41]:
                            - img [ref=f6e42] [cursor=pointer]
                          - cell "01" [ref=f6e43]
                          - cell [ref=f6e44]:
                            - img [ref=f6e45] [cursor=pointer]
                  - cell [ref=f6e46]
                - row
            - table [ref=f6e47]:
              - rowgroup [ref=f6e48]:
                - row "A/c. Opening - Current" [ref=f6e49]:
                  - cell "A/c. Opening - Current" [ref=f6e50]
            - table [ref=f6e51]:
              - rowgroup [ref=f6e52]:
                - row "Function Add" [ref=f6e53]:
                  - cell "Function" [ref=f6e54]
                  - cell "Add" [ref=f6e55]
                  - cell [ref=f6e56]
                  - cell [ref=f6e57]
                  - cell [ref=f6e58]
                - row "A/c. ID" [ref=f6e59]:
                  - cell "A/c. ID" [ref=f6e60]
                  - cell [ref=f6e61]
                - row "CIF ID 0002040146 MR XXXX X XXXCH CCY BMD" [ref=f6e62]:
                  - cell "CIF ID" [ref=f6e63]
                  - cell "0002040146 MR XXXX X XXXCH" [ref=f6e64]
                  - cell [ref=f6e65]
                  - cell "CCY" [ref=f6e66]
                  - cell "BMD" [ref=f6e67]
                - row "General Ledger Subhead Code 40100 - DEPOSITS - DEMAND Scheme Code CAREG - CHEQUING ACCOUNT (REGULAR)" [ref=f6e68]:
                  - cell "General Ledger Subhead Code" [ref=f6e69]
                  - cell "40100 - DEPOSITS - DEMAND" [ref=f6e70]
                  - cell [ref=f6e71]
                  - cell "Scheme Code" [ref=f6e72]
                  - cell "CAREG - CHEQUING ACCOUNT (REGULAR)" [ref=f6e73]
                - row "SOL ID 100" [ref=f6e74]:
                  - cell "SOL ID" [ref=f6e75]
                  - cell "100" [ref=f6e76]
            - generic [ref=f6e77]:
              - table [ref=f6e78]:
                - rowgroup [ref=f6e79]:
                  - row "Payment System Other Details FFD Parameters Document Details Account Limits Basel" [ref=f6e80]:
                    - cell "Payment System" [ref=f6e81] [cursor=pointer]:
                      - checkbox [ref=f6e82]
                      - generic [ref=f6e83]: Payment System
                    - cell "Other Details" [ref=f6e84] [cursor=pointer]:
                      - checkbox [ref=f6e85]
                      - generic [ref=f6e86]: Other Details
                    - cell "FFD Parameters" [ref=f6e87] [cursor=pointer]:
                      - checkbox [ref=f6e88]
                      - generic [ref=f6e89]: FFD Parameters
                    - cell "Document Details" [ref=f6e90] [cursor=pointer]:
                      - checkbox [ref=f6e91]
                      - generic [ref=f6e92]: Document Details
                    - cell "Account Limits" [ref=f6e93] [cursor=pointer]:
                      - checkbox [ref=f6e94]
                      - generic [ref=f6e95]: Account Limits
                    - cell "Basel" [ref=f6e96] [cursor=pointer]:
                      - generic [ref=f6e97]: Basel
              - table [ref=f6e98]:
                - rowgroup [ref=f6e99]:
                  - row "General Details Interest Details Scheme Details Nomination Details Related Party Details MIS Codes" [ref=f6e100]:
                    - cell "General Details" [ref=f6e101] [cursor=pointer]:
                      - generic [ref=f6e102]: General Details
                    - cell "Interest Details" [ref=f6e103] [cursor=pointer]:
                      - generic [ref=f6e104]: Interest Details
                    - cell "Scheme Details" [ref=f6e105] [cursor=pointer]:
                      - generic [ref=f6e106]: Scheme Details
                    - cell "Nomination Details" [ref=f6e107] [cursor=pointer]:
                      - checkbox [ref=f6e108]
                      - generic [ref=f6e109]: Nomination Details
                    - cell "Related Party Details" [ref=f6e110] [cursor=pointer]:
                      - checkbox [ref=f6e111]
                      - generic [ref=f6e112]: Related Party Details
                    - cell "MIS Codes" [ref=f6e113] [cursor=pointer]:
                      - checkbox [ref=f6e114]
                      - generic [ref=f6e115]: MIS Codes
              - table:
                - rowgroup:
                  - row
              - table [ref=f6e116]:
                - rowgroup [ref=f6e117]:
                  - row "Scheme Details Cheque Allowed Yes No Nomination Yes No Preferred Nomination Type Simultaneous Successive Cheques Provided by Bank Yes No Cheque Validity Period (MM/DD) NO 0 Recover Fee for Cheque Issue Yes No Debit Balance Limit 0.00 Return Paid Cheque Yes No Max. Allowed Limit 0.00 Sanction Limit 0.00 Expiry Date 01-12-2026 Select date from calendar. Paid Cheque Return Frequency Select Week Day Date Holiday Credit File No. A/c. Health Code Debt Acknowledgement Date Select date from calendar. Interest Advance Notice Days 0 Customer Health Code A/c. Min. Bal. Indicator Scheme A/c. A/c. Min. Balance 500.00 Sweep In Min. Bal. 0.00 Interest Method (Dr.) Select Transferred A/cs Details Interest Amt. 0.00 Debit/Credit Debit Credit None Min. Balance Amt. 0.00 A/c. Balance Last Debit Interest Compounded Till Select date from calendar. Provisioned Amt. Ad Hoc Provisioned Amt." [ref=f6e118]:
                    - cell "Scheme Details Cheque Allowed Yes No Nomination Yes No Preferred Nomination Type Simultaneous Successive Cheques Provided by Bank Yes No Cheque Validity Period (MM/DD) NO 0 Recover Fee for Cheque Issue Yes No Debit Balance Limit 0.00 Return Paid Cheque Yes No Max. Allowed Limit 0.00 Sanction Limit 0.00 Expiry Date 01-12-2026 Select date from calendar. Paid Cheque Return Frequency Select Week Day Date Holiday Credit File No. A/c. Health Code Debt Acknowledgement Date Select date from calendar. Interest Advance Notice Days 0 Customer Health Code A/c. Min. Bal. Indicator Scheme A/c. A/c. Min. Balance 500.00 Sweep In Min. Bal. 0.00 Interest Method (Dr.) Select Transferred A/cs Details Interest Amt. 0.00 Debit/Credit Debit Credit None Min. Balance Amt. 0.00 A/c. Balance Last Debit Interest Compounded Till Select date from calendar. Provisioned Amt. Ad Hoc Provisioned Amt." [ref=f6e119]:
                      - table [ref=f6e120]:
                        - rowgroup [ref=f6e121]:
                          - row "Scheme Details Cheque Allowed Yes No Nomination Yes No Preferred Nomination Type Simultaneous Successive Cheques Provided by Bank Yes No Cheque Validity Period (MM/DD) NO 0 Recover Fee for Cheque Issue Yes No Debit Balance Limit 0.00 Return Paid Cheque Yes No Max. Allowed Limit 0.00 Sanction Limit 0.00 Expiry Date 01-12-2026 Select date from calendar. Paid Cheque Return Frequency Select Week Day Date Holiday Credit File No. A/c. Health Code Debt Acknowledgement Date Select date from calendar. Interest Advance Notice Days 0 Customer Health Code A/c. Min. Bal. Indicator Scheme A/c. A/c. Min. Balance 500.00 Sweep In Min. Bal. 0.00 Interest Method (Dr.) Select Transferred A/cs Details Interest Amt. 0.00 Debit/Credit Debit Credit None Min. Balance Amt. 0.00 A/c. Balance Last Debit Interest Compounded Till Select date from calendar. Provisioned Amt. Ad Hoc Provisioned Amt." [ref=f6e122]:
                            - cell "Scheme Details Cheque Allowed Yes No Nomination Yes No Preferred Nomination Type Simultaneous Successive Cheques Provided by Bank Yes No Cheque Validity Period (MM/DD) NO 0 Recover Fee for Cheque Issue Yes No Debit Balance Limit 0.00 Return Paid Cheque Yes No Max. Allowed Limit 0.00 Sanction Limit 0.00 Expiry Date 01-12-2026 Select date from calendar. Paid Cheque Return Frequency Select Week Day Date Holiday Credit File No. A/c. Health Code Debt Acknowledgement Date Select date from calendar. Interest Advance Notice Days 0 Customer Health Code A/c. Min. Bal. Indicator Scheme A/c. A/c. Min. Balance 500.00 Sweep In Min. Bal. 0.00 Interest Method (Dr.) Select Transferred A/cs Details Interest Amt. 0.00 Debit/Credit Debit Credit None Min. Balance Amt. 0.00 A/c. Balance Last Debit Interest Compounded Till Select date from calendar. Provisioned Amt. Ad Hoc Provisioned Amt." [ref=f6e123]:
                              - table [ref=f6e124]:
                                - rowgroup [ref=f6e125]:
                                  - row [ref=f6e126]:
                                    - cell [ref=f6e127]
                                    - cell [ref=f6e128]
                                    - cell [ref=f6e129]
                                    - cell [ref=f6e130]
                                    - cell [ref=f6e131]:
                                      - table [ref=f6e132]:
                                        - rowgroup [ref=f6e133]:
                                          - row [ref=f6e134]:
                                            - cell [ref=f6e135]
                                            - cell [ref=f6e136]:
                                              - link [ref=f6e137] [cursor=pointer]:
                                                - /url: javascript:showHelpFile('sbscheme_details_help.htm');
                                                - img [ref=f6e138]
                                  - row "Scheme Details" [ref=f6e139]:
                                    - cell "Scheme Details" [ref=f6e140]
                                  - row [ref=f6e141]:
                                    - cell [ref=f6e142]
                                  - row "Cheque Allowed Yes No Nomination Yes No" [ref=f6e143]:
                                    - cell "Cheque Allowed" [ref=f6e144]
                                    - cell "Yes No" [ref=f6e145]:
                                      - radio [ref=f6e146]
                                      - text: "Yes"
                                      - radio [checked] [ref=f6e147]
                                      - text: "No"
                                    - cell [ref=f6e148]
                                    - cell "Nomination" [ref=f6e149]
                                    - cell "Yes No" [ref=f6e150]:
                                      - radio [ref=f6e151]
                                      - text: "Yes"
                                      - radio [checked] [ref=f6e152]
                                      - text: "No"
                                  - row "Preferred Nomination Type Simultaneous Successive" [ref=f6e153]:
                                    - cell [ref=f6e154]
                                    - cell [ref=f6e155]
                                    - cell [ref=f6e156]
                                    - cell "Preferred Nomination Type" [ref=f6e157]
                                    - cell "Simultaneous Successive" [ref=f6e158]:
                                      - radio [checked] [disabled] [ref=f6e159]
                                      - text: Simultaneous
                                      - radio [disabled] [ref=f6e160]
                                      - text: Successive
                                  - row "Cheques Provided by Bank Yes No Cheque Validity Period (MM/DD) NO 0" [ref=f6e161]:
                                    - cell "Cheques Provided by Bank" [ref=f6e162]
                                    - cell "Yes No" [ref=f6e163]:
                                      - radio [disabled] [ref=f6e164]
                                      - text: "Yes"
                                      - radio [checked] [disabled] [ref=f6e165]
                                      - text: "No"
                                    - cell [ref=f6e166]
                                    - cell "Cheque Validity Period (MM/DD)" [ref=f6e167]
                                    - cell "NO 0" [ref=f6e168]:
                                      - textbox [disabled] [ref=f6e169]: "NO"
                                      - textbox [disabled] [ref=f6e170]: "0"
                                  - row "Recover Fee for Cheque Issue Yes No Debit Balance Limit 0.00" [ref=f6e171]:
                                    - cell "Recover Fee for Cheque Issue" [ref=f6e172]
                                    - cell "Yes No" [ref=f6e173]:
                                      - radio [disabled] [ref=f6e174]
                                      - text: "Yes"
                                      - radio [checked] [disabled] [ref=f6e175]
                                      - text: "No"
                                    - cell [ref=f6e176]
                                    - cell "Debit Balance Limit" [ref=f6e177]
                                    - cell "0.00" [ref=f6e178]:
                                      - textbox [ref=f6e179]: "0.00"
                                  - row "Return Paid Cheque Yes No Max. Allowed Limit 0.00" [ref=f6e180]:
                                    - cell "Return Paid Cheque" [ref=f6e181]
                                    - cell "Yes No" [ref=f6e182]:
                                      - radio [disabled] [ref=f6e183]
                                      - text: "Yes"
                                      - radio [checked] [disabled] [ref=f6e184]
                                      - text: "No"
                                    - cell [ref=f6e185]
                                    - cell "Max. Allowed Limit" [ref=f6e186]
                                    - cell "0.00" [ref=f6e187]:
                                      - textbox [ref=f6e188]: "0.00"
                                  - row "Sanction Limit 0.00 Expiry Date 01-12-2026 Select date from calendar." [ref=f6e189]:
                                    - cell "Sanction Limit" [ref=f6e190]
                                    - cell "0.00" [ref=f6e191]:
                                      - textbox [ref=f6e192]: "0.00"
                                    - cell [ref=f6e193]
                                    - cell "Expiry Date" [ref=f6e194]
                                    - cell "01-12-2026 Select date from calendar." [ref=f6e195]:
                                      - textbox [ref=f6e196]: 01-12-2026
                                      - link "Select date from calendar." [ref=f6e197] [cursor=pointer]:
                                        - /url: javascript:openDate(document.forms[0].expiryDate_ui,"01-10-2026")
                                        - img "Select date from calendar." [ref=f6e198]
                                  - row "Paid Cheque Return Frequency Select Week Day Date Holiday Credit File No." [ref=f6e199]:
                                    - cell "Paid Cheque Return Frequency" [ref=f6e200]
                                    - cell "Select Week Day Date Holiday" [ref=f6e201]:
                                      - combobox [disabled] [ref=f6e202]:
                                        - option "Select" [selected]
                                        - option "D - Daily"
                                        - option "F - Fortnightly"
                                        - option "H - Half Yearly"
                                        - option "M - Monthly"
                                        - option "Q - Quarterly"
                                        - option "W - Weekly"
                                        - option "Y - Yearly"
                                      - combobox [disabled] [ref=f6e203]:
                                        - option "Week" [selected]
                                        - option "1 - First Week"
                                        - option "2 - Second Week"
                                        - option "3 - Third week"
                                        - option "4 - Fourth week"
                                        - option "L - Last Week"
                                        - option "M - Middle week"
                                      - combobox [disabled] [ref=f6e204]:
                                        - option "Day" [selected]
                                        - option "1 - Sunday"
                                        - option "2 - Monday"
                                        - option "3 - Tuesday"
                                        - option "4 - Wednesday"
                                        - option "5 - Thursday"
                                        - option "6 - Friday"
                                        - option "7 - Saturday"
                                      - combobox [disabled] [ref=f6e205]:
                                        - option "Date" [selected]
                                        - option "01"
                                        - option "02"
                                        - option "03"
                                        - option "04"
                                        - option "05"
                                        - option "06"
                                        - option "07"
                                        - option "08"
                                        - option "09"
                                        - option "10"
                                        - option "11"
                                        - option "12"
                                        - option "13"
                                        - option "14"
                                        - option "15"
                                        - option "16"
                                        - option "17"
                                        - option "18"
                                        - option "19"
                                        - option "20"
                                        - option "21"
                                        - option "22"
                                        - option "23"
                                        - option "24"
                                        - option "25"
                                        - option "26"
                                        - option "27"
                                        - option "28"
                                        - option "29"
                                        - option "30"
                                        - option "31"
                                      - combobox [disabled] [ref=f6e206]:
                                        - option "Holiday" [selected]
                                        - option "N - Next Day"
                                        - option "P - Previous day"
                                        - option "S - Skip"
                                    - cell [ref=f6e207]
                                    - cell "Credit File No." [ref=f6e208]
                                    - cell [ref=f6e209]:
                                      - textbox [ref=f6e210]
                                  - row "A/c. Health Code Debt Acknowledgement Date Select date from calendar." [ref=f6e211]:
                                    - cell "A/c. Health Code" [ref=f6e212]
                                    - cell [ref=f6e213]:
                                      - textbox [ref=f6e214]
                                      - link [ref=f6e215] [cursor=pointer]:
                                        - /url: javascript:showRefCode(objForm.acctHlthCode,17,'N','F',objForm.acctHlthDesc)
                                        - img [ref=f6e216]
                                      - textbox [disabled] [ref=f6e217]
                                    - cell [ref=f6e218]
                                    - cell "Debt Acknowledgement Date" [ref=f6e219]
                                    - cell "Select date from calendar." [ref=f6e220]:
                                      - textbox [ref=f6e221]
                                      - link "Select date from calendar." [ref=f6e222] [cursor=pointer]:
                                        - /url: javascript:openDate(document.forms[0].debtAckDate_ui,"01-10-2026")
                                        - img "Select date from calendar." [ref=f6e223]
                                  - row "Interest Advance Notice Days 0 Customer Health Code" [ref=f6e224]:
                                    - cell "Interest Advance Notice Days" [ref=f6e225]
                                    - cell "0" [ref=f6e226]:
                                      - textbox [ref=f6e227]: "0"
                                    - cell [ref=f6e228]
                                    - cell "Customer Health Code" [ref=f6e229]
                                    - cell [ref=f6e230]:
                                      - textbox [disabled] [ref=f6e231]
                                      - textbox [disabled] [ref=f6e232]
                                  - row "A/c. Min. Bal. Indicator Scheme A/c. A/c. Min. Balance 500.00" [ref=f6e233]:
                                    - cell "A/c. Min. Bal. Indicator" [ref=f6e234]
                                    - cell "Scheme A/c." [ref=f6e235]:
                                      - radio [checked] [ref=f6e236]
                                      - text: Scheme
                                      - radio [ref=f6e237]
                                      - text: A/c.
                                    - cell [ref=f6e238]
                                    - cell "A/c. Min. Balance" [ref=f6e239]
                                    - cell "500.00" [ref=f6e240]:
                                      - textbox [disabled] [ref=f6e241]: "500.00"
                                  - row "Sweep In Min. Bal. 0.00 Interest Method (Dr.) Select" [ref=f6e242]:
                                    - cell "Sweep In Min. Bal." [ref=f6e243]
                                    - cell "0.00" [ref=f6e244]:
                                      - textbox [ref=f6e245]: "0.00"
                                    - cell [ref=f6e246]
                                    - cell "Interest Method (Dr.)" [ref=f6e247]
                                    - cell "Select" [ref=f6e248]:
                                      - combobox [ref=f6e249]:
                                        - option "Select" [selected]
                                        - option "E - EOD Clear Balance"
                                        - option "D - EOD Book Balance"
                                        - option "T - End of Transaction Balance"
                                  - row [ref=f6e250]:
                                    - cell [ref=f6e251]
                                  - row "Transferred A/cs Details" [ref=f6e252]:
                                    - cell "Transferred A/cs Details" [ref=f6e253]
                                  - row [ref=f6e254]:
                                    - cell [ref=f6e255]
                                  - row "Interest Amt. 0.00 Debit/Credit Debit Credit None" [ref=f6e256]:
                                    - cell "Interest Amt." [ref=f6e257]
                                    - cell "0.00" [ref=f6e258]:
                                      - textbox [disabled] [ref=f6e259]: "0.00"
                                    - cell [ref=f6e260]
                                    - cell "Debit/Credit" [ref=f6e261]
                                    - cell "Debit Credit None" [ref=f6e262]:
                                      - radio [ref=f6e263]
                                      - text: Debit
                                      - radio [ref=f6e264]
                                      - text: Credit
                                      - radio [checked] [ref=f6e265]
                                      - text: None
                                  - row "Min. Balance Amt. 0.00 A/c. Balance" [ref=f6e266]:
                                    - cell "Min. Balance Amt." [ref=f6e267]
                                    - cell "0.00" [ref=f6e268]:
                                      - textbox [ref=f6e269]: "0.00"
                                    - cell [ref=f6e270]
                                    - cell "A/c. Balance" [ref=f6e271]
                                    - cell [ref=f6e272]:
                                      - textbox [disabled] [ref=f6e273]
                                      - textbox [disabled] [ref=f6e274]
                                  - row "Last Debit Interest Compounded Till Select date from calendar. Provisioned Amt." [ref=f6e275]:
                                    - cell "Last Debit Interest Compounded Till" [ref=f6e276]
                                    - cell "Select date from calendar." [ref=f6e277]:
                                      - textbox [ref=f6e278]
                                      - link "Select date from calendar." [ref=f6e279] [cursor=pointer]:
                                        - /url: javascript:openDate(document.forms[0].lastCmpndDt_ui,"01-10-2026")
                                        - img "Select date from calendar." [ref=f6e280]
                                    - cell [ref=f6e281]
                                    - cell "Provisioned Amt." [ref=f6e282]
                                    - cell [ref=f6e283]:
                                      - textbox [disabled] [ref=f6e284]
                                  - row "Ad Hoc Provisioned Amt." [ref=f6e285]:
                                    - cell "Ad Hoc Provisioned Amt." [ref=f6e286]
                                    - cell [ref=f6e287]:
                                      - textbox [disabled] [ref=f6e288]
                                  - row [ref=f6e289]:
                                    - cell [ref=f6e290]
          - generic [ref=f6e291]:
            - button "Submit" [active] [ref=f6e292] [cursor=pointer]
            - button "Validate" [ref=f6e293] [cursor=pointer]
            - button "Cancel" [ref=f6e294] [cursor=pointer]
    - alert [ref=f1e49]
```

# Test source

```ts
  77  |     (k) => data[k] != null && String(data[k]).trim() !== '' && !['Sheet', 'instance', 'enabled'].includes(k)
  78  |   );
  79  |   const usedKeys = new Set<string>();
  80  |   let report = '# HOAACCA Field Validation Report\n\n';
  81  |   let total = 0, pass = 0, fail = 0, unmapped = 0;
  82  | 
  83  |   for (const tab of tabs) {
  84  |     report += `## ${tab.tab}\n\n`;
  85  |     report += '| Excel Key | Expected | UI Label | UI Value | Status |\n';
  86  |     report += '|-----------|----------|----------|----------|--------|\n';
  87  |     for (const f of tab.fields) {
  88  |       const fNorm = norm(f.label || f.id || f.name);
  89  |       let matchKey: string | undefined;
  90  |       let bestScore = 0;
  91  |       for (const k of dataKeys) {
  92  |         if (usedKeys.has(k)) continue;
  93  |         const kNorm = norm(k);
  94  |         if (!kNorm) continue;
  95  |         if (fNorm.includes(kNorm) || kNorm.includes(fNorm)) {
  96  |           const score = Math.min(fNorm.length, kNorm.length);
  97  |           if (score > bestScore) {
  98  |             bestScore = score;
  99  |             matchKey = k;
  100 |           }
  101 |         }
  102 |       }
  103 |       const expected = matchKey ? String(data[matchKey]).trim() : '';
  104 |       const actual = String(f.value).trim();
  105 |       const code = expected.split('-')[0].trim().toLowerCase();
  106 |       let status = 'unmapped';
  107 |       if (matchKey) {
  108 |         usedKeys.add(matchKey);
  109 |         total++;
  110 |         if (actual === '' || actual.toLowerCase() === 'select') {
  111 |           status = 'not set';
  112 |           fail++;
  113 |         } else if (
  114 |           actual.toLowerCase().includes(expected.toLowerCase()) ||
  115 |           expected.toLowerCase().includes(actual.toLowerCase()) ||
  116 |           actual.toLowerCase().startsWith(code)
  117 |         ) {
  118 |           status = 'pass';
  119 |           pass++;
  120 |         } else {
  121 |           status = 'fail';
  122 |           fail++;
  123 |         }
  124 |       }
  125 |       const label = (f.label || f.id || f.name || '').replace(/\\|/g, '\\\\|');
  126 |       report += `| ${matchKey ?? ''} | ${expected.replace(/\\|/g, '\\\\|')} | ${label} | ${actual.replace(/\\|/g, '\\\\|')} | ${status} |\n`;
  127 |     }
  128 |     report += '\n';
  129 |   }
  130 | 
  131 |   const missingExcel = dataKeys.filter((k) => !usedKeys.has(k));
  132 |   if (missingExcel.length) {
  133 |     report += '## Unmapped Excel Columns (non-empty)\n\n';
  134 |     report += '| Excel Key | Expected |\n|-----------|----------|\n';
  135 |     for (const k of missingExcel) {
  136 |       report += `| ${k} | ${String(data[k]).trim().replace(/\\|/g, '\\\\|')} |\n`;
  137 |     }
  138 |     unmapped = missingExcel.length;
  139 |     report += '\n';
  140 |   }
  141 | 
  142 |   report += `## Summary\n\n- Matched fields: ${total}\n- Passed: ${pass}\n- Failed / Not set: ${fail}\n- Unmapped Excel columns: ${unmapped}\n`;
  143 |   return report;
  144 | }
  145 | 
  146 | for (const scenario of SCENARIOS) {
  147 |   test(`HOAACCA - create current account (${scenario.name})`, async ({ page }) => {
  148 |     test.setTimeout(900000);
  149 | 
  150 |     try {
  151 |       await loginToFinacle(page, USERNAME, PASSWORD);
  152 |       const homePage = new HomePage(page);
  153 |       const currentAccountPage = new AccountPage(page);
  154 | 
  155 |       console.log('Selecting Core Server...');
  156 |       await currentAccountPage.selectCoreServer();
  157 | 
  158 |       console.log(`Searching for ${CURRENT_ACCOUNT_MENU}...`);
  159 |       await currentAccountPage.searchMenu(CURRENT_ACCOUNT_MENU);
  160 | 
  161 |       console.log(`Creating current account ${scenario.name} (CIF: ${scenario.data.cifCode})...`);
  162 |       console.log(`Related party rows for this account: ${scenario.relatedParties?.length || 0}`);
  163 |       await currentAccountPage.createCurrentAccount(scenario.data as any, scenario.relatedParties || []);
  164 | 
  165 |       const tabReports = await currentAccountPage.getTabReports();
  166 |       const report = generateValidationReport(scenario.data, tabReports);
  167 |       writeFileSync('test-results/hoaacca-validation-report.md', report);
  168 | 
  169 |       const result = await currentAccountPage.verifyAccountCreated();
  170 |       console.log('Exact result message:', result.message);
  171 | 
  172 |       if (!result.success) {
  173 |         console.error('Current account creation failed. Exact error message:', result.message);
  174 |         console.error('Captured fields:', JSON.stringify(result.allFields, null, 2));
  175 |       }
  176 | 
> 177 |       expect(result.success, `Expected success but got: ${result.message}`).toBe(true);
      |                                                                             ^ Error: Expected success but got: null
  178 |       expect(result.message).toBeTruthy();
  179 |       console.log('Account created:', result.message);
  180 |       expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated|New A\/c\.?\s*ID|Account Number|Account No)/i);
  181 |       console.log('Captured Account ID:', result.accountNumber);
  182 |       expect(result.accountNumber).toBeTruthy();
  183 | 
  184 |       const instanceKey = scenario.data.instance != null ? String(scenario.data.instance) : undefined;
  185 |       writeSharedState({ accountId: result.accountNumber });
  186 |       updateSharedState((state) => {
  187 |         state.accountId = result.accountNumber;
  188 |         if (!state.currentAccounts) state.currentAccounts = {};
  189 |         state.currentAccounts[scenario.name] = result.accountNumber ?? '';
  190 |         if (instanceKey) state.currentAccounts[instanceKey] = result.accountNumber ?? '';
  191 |       });
  192 | 
  193 |       console.log('Logging out...');
  194 |       await homePage.logout();
  195 |     } catch (err: any) {
  196 |       console.error(`Current account creation test failed for ${scenario.name}:`, err);
  197 |       console.error(`CIF used: ${scenario.data.cifCode}`);
  198 |       throw err;
  199 |     }
  200 |   });
  201 | }
  202 | 
  203 | // === STRICT ASSERTIONS INJECTION ===
  204 | test.afterEach(async ({ page }) => {
  205 |   if (page.isClosed()) return;
  206 |   const html = (await page.content()).toLowerCase();
  207 |   expect(html).not.toMatch(/core dump|internal server error/);
  208 | });
  209 | 
```
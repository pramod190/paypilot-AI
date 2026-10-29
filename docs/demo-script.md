# PayPilot AI — Hackathon Video Demonstration Script
## Target Duration: 2 minutes 40 seconds (< 3 minutes)

### [0:00 – 0:25] The Problem & Solution
- **Action**: Open PayPilot AI Dashboard on `http://localhost:5173`.
- **Narration**:
  > "Freelancers and SMBs spend hours interpreting invoices, checking if bills were already paid, copying amounts into payment tools, and reconciling receipts. Generic AI chatbots fail because they can't execute safe payments or guarantee financial integrity.
  >
  > Welcome to **PayPilot AI** — the AI payment copilot that turns invoices and natural-language requests into secure, user-approved, verifiable PayPal payments."

---

### [0:25 – 0:55] AI Copilot & Invoice Understanding
- **Action**: Click on **AI Copilot** tab. Point out the suggested prompts. Click or type:
  `"Prepare my hosting payment for this month"`
- **Narration**:
  > "I can simply ask PayPilot to 'Prepare my hosting payment for this month'.
  >
  > Notice what happens: The AI grounds itself in our actual database records. It matches the unpaid **AWS Cloud Services** invoice for **$24.99**, extracts the exact billing period, and calls the backend TrustGuard Policy Engine to evaluate safety."

---

### [0:55 – 1:25] TrustGuard & Explicit Approval
- **Action**: Zoom in on the **Payment Intent Card** and **TrustGuard Evaluation Panel**.
- **Narration**:
  > "TrustGuard evaluates 10 strict deterministic security rules: verifying positive amount, supported currency, lack of duplicate payments, and active invoice status. The LLM is never the authority for security decisions.
  >
  > Next, we observe **Approval Integrity**: PayPilot requires an explicit, server-side user approval bound to version 1. Let's click **Explicitly Approve (v1)**."

---

### [1:25 – 2:05] PayPal Sandbox Checkout & Server Capture
- **Action**: Click **Proceed to PayPal Sandbox Checkout**. Show the PayPal Orders v2 dialog with live order ID. Click **Instant Pay & Capture**.
- **Narration**:
  > "Now, PayPilot creates a real PayPal Order v2 in the PayPal Sandbox.
  >
  > When we proceed with checkout, the backend authoritatively captures the transaction directly with the PayPal REST API, verifying that the captured amount and currency exactly match our approved intent. No simulated tokens or fabricated responses."

---

### [2:05 – 2:25] Authoritative Receipt & Audit Trail
- **Action**: Show the **Payment Verified Receipt** with celebratory confetti, real Capture ID, PayPal Order ID, and Audit Trail. Close modal and show the AWS invoice now marked as **PAID**.
- **Narration**:
  > "Immediately upon verification, PayPilot displays an authoritative receipt complete with the authoritatively verified Capture ID, PayPal Order ID, and complete audit trail. The database transitions the invoice status to PAID."

---

### [2:25 – 2:40] Safety Proof: Duplicate & Tampering Protection
- **Action**: Switch back to AI Copilot and ask: `"Pay AWS Cloud Services invoice again"`. Show TrustGuard blocking the duplicate payment.
- **Narration**:
  > "Finally, let's test safety: If we attempt to pay the same hosting bill again, TrustGuard immediately blocks it: 'Invoice is already marked as PAID.'
  >
  > Real AI understanding, deterministic TrustGuard policies, and authoritative PayPal Sandbox execution. That's PayPilot AI."

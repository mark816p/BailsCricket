// BAILS — PRIVACY POLICY & TERMS OF SERVICE
const LegalPage = (() => {
  function renderPrivacy() {
    Utils.render(`
      <div class="legal-page">
        <a href="#/" onclick="Router.back(); return false;" class="btn btn-ghost btn-sm" style="margin-bottom:16px;padding-left:0">← Back</a>
        <h1>Privacy Policy</h1>
        <div class="last-updated">Last updated: January 1, 2025</div>
        <h2>1. Introduction</h2>
        <p>Welcome to Bails ("we," "us," "our"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our cricket scoring application ("App"). By using the App, you consent to these data practices.</p>
        <h2>2. Information We Collect</h2>
        <h3>2.1 Account Information</h3>
        <ul>
          <li>Name, email address, and profile picture from your social sign-in provider (Google or X/Twitter)</li>
          <li>Username and display name chosen during registration</li>
          <li>Playing profile: batting style, bowling hand, bowling style, wicket-keeper status</li>
        </ul>
        <h3>2.2 Usage Data</h3>
        <ul>
          <li>Match data you create or score, including ball-by-ball deliveries, scorecards, and tournament records</li>
          <li>Timestamps of activity and matches</li>
          <li>Teams you belong to and tournaments you participate in or follow</li>
          <li>Invitations sent and received</li>
          <li>Chat messages within matches</li>
        </ul>
        <h3>2.3 Technical Data</h3>
        <ul>
          <li>IP address (used to estimate geographic region for nearby match discovery via ip-api.com)</li>
          <li>Device type, operating system, and browser information</li>
          <li>App crash logs and error reports via Firebase</li>
        </ul>
        <h3>2.4 Images</h3>
        <ul>
          <li>Profile pictures, team logos, and tournament covers you voluntarily upload</li>
          <li>All uploaded images are automatically compressed client-side to under 100 KB, then stored as encoded strings in our database</li>
        </ul>
        <h2>3. How We Use Your Information</h2>
        <ul>
          <li>To create and manage your account</li>
          <li>To display live scores, match history, and statistics</li>
          <li>To enable tournament management and team coordination</li>
          <li>To show nearby matches using your approximate location (IP-based, not GPS)</li>
          <li>To improve the App and develop new features</li>
          <li>To send in-app notifications (invitations, match updates)</li>
          <li>To enforce our Terms of Service and prevent misuse</li>
          <li>For internal analytics and aggregate usage statistics</li>
          <li>To comply with applicable laws and regulations</li>
        </ul>
        <p><strong>We do not sell your personal data to third parties. We do not serve advertisements in Bails.</strong></p>
        <h2>4. Data Sharing</h2>
        <ul>
          <li><strong>Firebase (Google LLC):</strong> Our hosting, authentication, and database provider. Subject to Google's data processing terms.</li>
          <li><strong>ip-api.com:</strong> Used for IP geolocation to show nearby matches. Your IP address is sent to this service. No account data is shared.</li>
          <li><strong>Other users:</strong> Your username, display name, and profile picture are visible to other Bails users. Match data you create is visible to participants and tournament followers. Chat messages are visible to all users who view that match.</li>
          <li><strong>Law enforcement:</strong> We may disclose data if legally required.</li>
        </ul>
        <h2>5. Data Retention</h2>
        <p>We retain your data for as long as your account is active. You may request deletion by contacting us. Match and tournament data shared with others may be retained in anonymised form for statistical integrity.</p>
        <h2>6. Security</h2>
        <p>We implement Firebase Security Rules, HTTPS encryption, client-side image compression, and access controls. No internet transmission is 100% secure.</p>
        <h2>7. Children's Privacy</h2>
        <p>The App is not directed at children under 13. We do not knowingly collect data from children under 13.</p>
        <h2>8. Your Rights</h2>
        <ul>
          <li>Access your personal data</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your account and data</li>
          <li>Withdraw consent by deleting your account</li>
        </ul>
        <p>Contact: <strong><a href="mailto:bailscricketscorer@gmail.com">bailscricketscorer@gmail.com</a></strong></p>
        <h2>9. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. Continued use after changes constitutes acceptance.</p>
      </div>
    `);
  }

  function renderTerms() {
    Utils.render(`
      <div class="legal-page">
        <a href="#/" onclick="Router.back(); return false;" class="btn btn-ghost btn-sm" style="margin-bottom:16px;padding-left:0">← Back</a>
        <h1>Terms of Service</h1>
        <div class="last-updated">Last updated: January 1, 2025</div>
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using Bails, you agree to these Terms and our Privacy Policy. If you do not agree, do not use the Service.</p>
        <h2>2. Eligibility</h2>
        <p>You must be at least 13 years of age. Users between 13–18 require parental consent.</p>
        <h2>3. Account Registration</h2>
        <ul>
          <li>You are responsible for maintaining the confidentiality of your account</li>
          <li>Provide accurate and complete information</li>
          <li>Usernames must not impersonate others or contain offensive language</li>
          <li>Do not share your account credentials</li>
        </ul>
        <h2>4. Acceptable Use</h2>
        <p>You agree NOT to: use the Service unlawfully; upload defamatory or harmful content; hack or disrupt the Service; create fake accounts; scrape data; manipulate match scores fraudulently; send unsolicited messages in match chat.</p>
        <h2>5. User-Generated Content</h2>
        <p>You retain ownership of content you create. By submitting content, you grant us a non-exclusive, royalty-free, worldwide licence to use, store, and display it to operate the Service. We may remove content that violates these Terms.</p>
        <h2>6. Match Data and Accuracy</h2>
        <p>Tournament owners and admins are responsible for the accuracy of data entered. We are not liable for incorrect scores or statistics entered by users.</p>
        <h2>7. Privacy</h2>
        <p>Your use is also governed by our <a href="#/privacy">Privacy Policy</a>, incorporated herein by reference.</p>
        <h2>8. Intellectual Property</h2>
        <p>The Bails name, logo, and application code are owned by the developer. You may not reproduce or create derivative works without permission.</p>
        <h2>9. Disclaimer of Warranties</h2>
        <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE UNINTERRUPTED OR ERROR-FREE SERVICE.</p>
        <h2>10. Limitation of Liability</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES.</p>
        <h2>11. Termination</h2>
        <p>We may suspend or terminate your account for violation of these Terms without prior notice. You may delete your account at any time from your Profile settings.</p>
        <h2>12. Governing Law</h2>
        <p>These Terms are governed by the laws of India. Disputes shall be subject to the exclusive jurisdiction of the courts of India.</p>
        <h2>13. Changes to Terms</h2>
        <p>We may update these Terms from time to time. Continued use after changes constitutes acceptance.</p>
        <h2>14. Contact</h2>
        <p><strong><a href="mailto:bailscricketscorer@gmail.com">bailscricketscorer@gmail.com</a></strong></p>
      </div>
    `);
  }

  return { renderPrivacy, renderTerms };
})();

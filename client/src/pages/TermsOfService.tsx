import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Telescope, ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 inset-x-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Telescope className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">AstroPilot</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/">
            <Button variant="ghost" className="mb-6" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>

          <Card>
            <CardContent className="pt-8 pb-8 px-6 md:px-10">
              <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
              <p className="text-muted-foreground mb-8">Last updated: December 2024</p>

              <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
                <section>
                  <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    By accessing or using AstroPilot ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    AstroPilot is an astronomy observation planning application that provides tools for equipment management, celestial object tracking, observation logging, and related features. The Service is provided "as is" for personal, non-commercial use.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">3. User Accounts</h2>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    To use certain features of the Service, you must create an account. You agree to:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                    <li>Provide accurate and complete information</li>
                    <li>Maintain the security of your account credentials</li>
                    <li>Notify us immediately of any unauthorized use</li>
                    <li>Accept responsibility for all activities under your account</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">4. Acceptable Use</h2>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    You agree not to:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                    <li>Use the Service for any unlawful purpose</li>
                    <li>Attempt to gain unauthorized access to any part of the Service</li>
                    <li>Interfere with or disrupt the Service or servers</li>
                    <li>Upload malicious code or content</li>
                    <li>Scrape, harvest, or collect data from the Service without permission</li>
                    <li>Impersonate any person or entity</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">5. Intellectual Property</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    The Service and its original content, features, and functionality are owned by AstroPilot and are protected by international copyright, trademark, and other intellectual property laws. Your observation data and personal content remain your property.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">6. Third-Party Services and Data</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    The Service integrates with third-party services including NASA APIs, Google Authentication, and OpenStreetMap. Your use of these services is subject to their respective terms and policies. We are not responsible for the accuracy, availability, or reliability of third-party data.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">7. Disclaimer of Warranties</h2>
                  <p className="text-muted-foreground leading-relaxed font-medium">
                    THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    We do not warrant that:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
                    <li>The Service will be uninterrupted, secure, or error-free</li>
                    <li>Results obtained from the Service will be accurate or reliable</li>
                    <li>Any astronomical calculations, recommendations, or data are guaranteed to be accurate</li>
                    <li>The Service will meet your specific requirements</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">8. Limitation of Liability</h2>
                  <p className="text-muted-foreground leading-relaxed font-medium">
                    TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ASTROPILOT, ITS OPERATORS, AFFILIATES, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-3">
                    <li>Your access to or use of (or inability to access or use) the Service</li>
                    <li>Any conduct or content of any third party on the Service</li>
                    <li>Any content obtained from the Service</li>
                    <li>Unauthorized access, use, or alteration of your transmissions or content</li>
                    <li>Reliance on astronomical data, calculations, or recommendations provided by the Service</li>
                    <li>Equipment damage, personal injury, or property damage arising from your use of the Service</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">9. Indemnification</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    You agree to defend, indemnify, and hold harmless AstroPilot and its operators from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to your violation of these Terms or your use of the Service.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">10. Data Protection (GDPR Compliance)</h2>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    For users in the European Economic Area (EEA), we comply with the General Data Protection Regulation (GDPR). You have the right to:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                    <li>Access your personal data</li>
                    <li>Rectify inaccurate data</li>
                    <li>Request erasure of your data</li>
                    <li>Object to data processing</li>
                    <li>Data portability</li>
                    <li>Lodge a complaint with a supervisory authority</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    Our legal basis for processing your data is your consent (by creating an account) and legitimate interest (providing the Service). See our Privacy Policy for more details.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">11. Termination</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including breach of these Terms. Upon termination, your right to use the Service will cease immediately. You may delete your account at any time.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">12. Changes to Terms</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. Your continued use of the Service after changes constitutes acceptance of the new Terms.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">13. Governing Law</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law provisions. Any disputes arising from these Terms or the Service shall be resolved through binding arbitration or in the courts of competent jurisdiction.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">14. Severability</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    If any provision of these Terms is held to be unenforceable or invalid, such provision will be changed and interpreted to accomplish the objectives of such provision to the greatest extent possible under applicable law, and the remaining provisions will continue in full force and effect.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">15. Entire Agreement</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    These Terms constitute the entire agreement between you and AstroPilot regarding the Service and supersede all prior agreements and understandings.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">16. Contact Information</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    If you have any questions about these Terms, please contact us at: <strong>legal@astropilot.space</strong>
                  </p>
                </section>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

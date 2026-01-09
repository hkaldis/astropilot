import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Telescope, ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
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
              <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
              <p className="text-muted-foreground mb-8">Last updated: December 2024</p>

              <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
                <section>
                  <h2 className="text-xl font-semibold mb-3">Our Commitment to Your Privacy</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    AstroPilot ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our astronomy observation planning application.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-3 font-medium">
                    We do not sell, trade, rent, or otherwise share your personal information with third parties for marketing purposes. Your data belongs to you.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">Information We Collect</h2>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    We collect only the minimum information necessary to provide our service:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                    <li><strong>Account Information:</strong> Email address, name (if provided), and profile picture (if using Google Sign-In)</li>
                    <li><strong>Observation Data:</strong> Equipment, locations, observation sessions, and notes you choose to save</li>
                    <li><strong>Usage Data:</strong> Basic interaction data to improve the application experience</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">How We Use Your Information</h2>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    Your information is used solely to:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                    <li>Provide and maintain the AstroPilot service</li>
                    <li>Authenticate your account</li>
                    <li>Store your observation data for your personal use</li>
                    <li>Improve application functionality</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3 font-medium">
                    We do not use your data for advertising, profiling, or any purpose other than providing the service you signed up for.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">Data Storage and Security</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Your data is stored securely using industry-standard encryption and security practices. We use secure HTTPS connections for all data transmission. Passwords are hashed using bcrypt and are never stored in plain text.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">Third-Party Services</h2>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    We use the following third-party services:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                    <li><strong>Google Sign-In:</strong> For optional authentication (subject to Google's Privacy Policy)</li>
                    <li><strong>NASA APIs:</strong> For astronomy data (no personal data is shared)</li>
                    <li><strong>OpenStreetMap:</strong> For location services (no personal data is shared)</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">Your Rights (GDPR & Data Protection)</h2>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    You have the right to:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                    <li><strong>Access:</strong> Request a copy of your personal data</li>
                    <li><strong>Rectification:</strong> Correct any inaccurate personal data</li>
                    <li><strong>Erasure:</strong> Request deletion of your personal data</li>
                    <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format</li>
                    <li><strong>Withdraw Consent:</strong> Withdraw consent at any time by deleting your account</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    To exercise any of these rights, please contact us at the email provided below.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">Data Retention</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We retain your data only for as long as your account is active. If you delete your account, all associated personal data will be permanently removed from our systems within 30 days.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">Children's Privacy</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    AstroPilot is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">Changes to This Policy</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">Contact Us</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    If you have any questions about this Privacy Policy or wish to exercise your data rights, please contact us at: <strong>privacy@astropilot.space</strong>
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

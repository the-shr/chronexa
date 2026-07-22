import './globals.css';

export const metadata = {
  title: 'TimeTracker Admin',
  description: 'Team time tracking, activity and screenshots',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

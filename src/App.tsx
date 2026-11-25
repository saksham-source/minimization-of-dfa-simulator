import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './app/ErrorBoundary';
import { Layout } from './app/Layout';
import { HelpPage } from './features/help/HelpPage';
import { LandingPage } from './features/landing/LandingPage';
import { LearnPage } from './features/learning/LearnPage';
import { PracticePage } from './features/practice/PracticePage';
import { SimulatorRoute } from './features/simulator/SimulatorRoute';
import { AppProvider } from './store/AppContext';

function NotFoundPage() {
  return (
    <div className="page-container">
      <div className="panel">
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Page not found</h1>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            That route does not exist in DFA Studio.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/" className="btn btn-primary btn-sm">
              Go to Home
            </Link>
            <Link to="/simulator" className="btn btn-sm">
              Open Simulator
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Layout>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/simulator" element={<SimulatorRoute />} />
              <Route path="/practice" element={<PracticePage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth/AuthContext';
import Button from '../../components/ui/Button';
import BrandLogo from '../../components/branding/BrandLogo';

function HomePage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const handleWatchDemoClick = () => {
    const videoSection = document.getElementById('home-demo-video');

    if (videoSection) {
      videoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleDashboardClick = () => {
    const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/teacher/dashboard';
    navigate(dashboardPath);
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden selection:bg-indigo-500/30 gradient-bg-page flex flex-col">
      {/* Decorative background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-600/10 blur-[100px] pointer-events-none animate-float" style={{ animationDelay: '2s' }} />

      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20">
            <BrandLogo size="sm" />
            <div className="flex items-center gap-3 sm:gap-4">
              {isAuthenticated ? (
                <Button variant="gradient-primary" onClick={handleDashboardClick} className="text-sm font-semibold rounded-xl">
                  Go to Dashboard
                  <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Button>
              ) : (
                <>
                  <Link to="/auth/login" className="hidden sm:inline-block">
                    <Button variant="ghost" className="text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/auth/signup">
                    <Button variant="gradient-primary" className="text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/25">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-20 pb-32 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-widest mb-6 animate-fade-in-up">
                <span className="flex w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                Next-Gen Proctoring
              </div>
              
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-8 animate-fade-in-up stagger-1 leading-tight">
                <span className="block">AI-Powered</span>
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-gradient-shift bg-[length:200%_auto]">
                  Secure Exam
                </span>
              </h1>
              
              <p className="mt-4 text-lg sm:text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto font-medium leading-relaxed animate-fade-in-up stagger-2">
                Ensure exam integrity with advanced AI monitoring, real-time incident detection, 
                and comprehensive analytics. Perfect for educational institutions and certification bodies.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up stagger-3">
                <Link to="/auth/signup" className="w-full sm:w-auto">
                  <Button variant="gradient-primary" size="lg" className="w-full sm:w-auto justify-center text-base rounded-xl shadow-xl shadow-indigo-500/30 py-4 px-8 group">
                    Start Free Trial
                    <svg className="w-5 h-5 ml-2 transform transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleWatchDemoClick}
                  className="w-full sm:w-auto justify-center text-base rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border-gray-200 shadow-sm py-4 px-8"
                >
                  <svg className="w-5 h-5 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Watch Demo
                </Button>
              </div>
            </div>

            {/* Demo Video */}
            <div className="mt-20 relative animate-scale-in stagger-4">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-30 blur-2xl"></div>
              <div id="home-demo-video" className="relative rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-2xl p-2 shadow-2xl overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-12 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 flex items-center px-4 gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  <div className="ml-3 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-300">
                    Demo Video
                  </div>
                </div>
                <div className="mt-12 w-full rounded-xl bg-gray-950 border border-gray-100/50 dark:border-gray-700/50 overflow-hidden relative aspect-video">
                  <video
                    className="block w-full h-full object-cover"
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  >
                    <source src="/videp.mp4" type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 relative overflow-hidden bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border-t border-gray-200/50 dark:border-gray-800/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-sm font-bold tracking-widest uppercase text-indigo-600 dark:text-indigo-400 mb-3">Enterprise Features</h2>
              <p className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                Everything you need for safe & secure exams
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: 'Real-time Monitoring',
                  desc: 'Monitor exam sessions in real-time with AI-powered behavior analysis and instant alerts.',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />,
                  color: 'from-blue-500 to-indigo-600'
                },
                {
                  title: 'Incident Detection',
                  desc: 'Automatically detect suspicious behavior and potential cheating attempts with advanced AI models.',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />,
                  color: 'from-rose-500 to-pink-600'
                },
                {
                  title: 'Analytics & Reports',
                  desc: 'Comprehensive post-exam analytics and detailed evidentiary reports for all security incidents.',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
                  color: 'from-emerald-500 to-teal-600'
                },
                {
                  title: 'Secure & Compliant',
                  desc: 'Enterprise-grade system architectural security with strict GDPR compliance and data protection standards.',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />,
                  color: 'from-amber-500 to-orange-600'
                }
              ].map((feature, idx) => (
                <div key={idx} className="glass-card p-6 h-full transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center shadow-lg mb-6`}>
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {feature.icon}
                    </svg>
                  </div>
                  <h3 className="text-[17px] font-bold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/50 dark:border-gray-800/50 bg-white/30 dark:bg-slate-900/30 backdrop-blur-md relative z-10">
        <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <p className="text-center text-sm font-semibold text-gray-500 dark:text-gray-400">
              &copy; {new Date().getFullYear()} Secure Exam. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;

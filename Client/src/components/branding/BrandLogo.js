import React from 'react';

function BrandLogo({
  size = 'md',
  showText = true,
  className = '',
  textClassName = '',
}) {
  const sizeClasses = {
    sm: {
      wrap: 'w-9 h-9 rounded-xl',
      icon: 'w-5 h-5',
      text: 'text-xl',
      gap: 'gap-2.5',
    },
    md: {
      wrap: 'w-10 h-10 rounded-xl',
      icon: 'w-5.5 h-5.5',
      text: 'text-2xl',
      gap: 'gap-3',
    },
    lg: {
      wrap: 'w-12 h-12 rounded-2xl',
      icon: 'w-6 h-6',
      text: 'text-3xl',
      gap: 'gap-3.5',
    },
  };

  const selected = sizeClasses[size] || sizeClasses.md;

  return (
    <div className={`flex items-center ${selected.gap} ${className}`}>
      <div className={`${selected.wrap} bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30`}>
        <svg className={`${selected.icon} text-white`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </div>

      {showText && (
        <span className={`font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent ${selected.text} ${textClassName}`}>
          Secure Exam
        </span>
      )}
    </div>
  );
}

export default BrandLogo;

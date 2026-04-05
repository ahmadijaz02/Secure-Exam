import React from 'react';

function Card({ 
  children, 
  className = '', 
  padding = 'default',
  shadow = 'default',
  border = true,
  glass = false,
  hover = true,
  animate = true,
  ...props 
}) {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    default: 'p-6',
    lg: 'p-8',
  };

  if (glass) {
    return (
      <div
        className={`${hover ? 'glass-card' : 'glass-card-static'} ${animate ? 'animate-fade-in-up' : ''} ${paddingClasses[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }

  const shadowClasses = {
    none: '',
    sm: 'shadow-sm',
    default: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
  };

  const borderClass = border ? 'border border-gray-200/60 dark:border-slate-700/50' : '';

  const classes = `
    bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl
    ${paddingClasses[padding]}
    ${shadowClasses[shadow]}
    ${borderClass}
    ${hover ? 'transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5' : 'transition-colors duration-200'}
    ${animate ? 'animate-fade-in-up' : ''}
    ${className}
  `;

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

function CardHeader({ children, className = '', ...props }) {
  return (
    <div className={`border-b border-gray-200/60 dark:border-slate-700/50 pb-4 mb-4 px-6 pt-5 ${className}`} {...props}>
      {children}
    </div>
  );
}

function CardTitle({ children, className = '', ...props }) {
  return (
    <h3 className={`text-lg font-bold text-gray-900 dark:text-white tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  );
}

function CardContent({ children, className = '', ...props }) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

function CardFooter({ children, className = '', ...props }) {
  return (
    <div className={`border-t border-gray-200/60 dark:border-slate-700/50 pt-4 mt-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

// Attach sub-components to main Card component
Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;

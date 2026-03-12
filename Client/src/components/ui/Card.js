import React from 'react';

function Card({ 
  children, 
  className = '', 
  padding = 'default',
  shadow = 'default',
  border = true,
  ...props 
}) {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    default: 'p-6',
    lg: 'p-8',
  };

  const shadowClasses = {
    none: '',
    sm: 'shadow-sm',
    default: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
  };

  const borderClass = border ? 'border border-gray-200 dark:border-slate-700' : '';

  const classes = `
    bg-white dark:bg-slate-800 rounded-lg
    ${paddingClasses[padding]}
    ${shadowClasses[shadow]}
    ${borderClass}
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
    <div className={`border-b border-gray-200 dark:border-slate-700 pb-4 mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

function CardTitle({ children, className = '', ...props }) {
  return (
    <h3 className={`text-lg font-semibold text-gray-900 dark:text-white ${className}`} {...props}>
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
    <div className={`border-t border-gray-200 dark:border-slate-700 pt-4 mt-4 ${className}`} {...props}>
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

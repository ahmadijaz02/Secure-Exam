#!/usr/bin/env python3
"""
Admin seeding script for Secure Exam
Creates a default admin user if one doesn't exist
"""

import os
import sys
from getpass import getpass

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.models import User

def seed_admin():
    """Create default admin user"""
    app = create_app()
    
    with app.app_context():
        user_model = app.user_model
        
        print("🔧 Admin User Seeding")
        print("=" * 50)
        
        # Check if admin already exists
        existing_admin = user_model.collection.find_one({'role': 'admin'})
        if existing_admin:
            print(f"✅ Admin user already exists: {existing_admin['email']}")
            print("No action needed.")
            return
        
        print("No admin user found. Creating default admin...")
        print()
        
        # Get admin details
        while True:
            name = input("Enter admin name: ").strip()
            if name:
                break
            print("Name cannot be empty!")
        
        while True:
            email = input("Enter admin email: ").strip().lower()
            if email and '@' in email:
                # Check if email already exists
                existing_user = user_model.find_by_email(email)
                if existing_user:
                    print(f"❌ Email {email} already exists!")
                    continue
                break
            print("Please enter a valid email address!")
        
        while True:
            password = getpass("Enter admin password: ")
            if len(password) >= 6:
                confirm_password = getpass("Confirm admin password: ")
                if password == confirm_password:
                    break
                else:
                    print("❌ Passwords do not match!")
            else:
                print("❌ Password must be at least 6 characters long!")
        
        try:
            # Create admin user
            admin_user = user_model.create_user(
                name=name,
                email=email,
                password=password,
                role='admin'
            )
            
            print()
            print("✅ Admin user created successfully!")
            print(f"   Name: {admin_user['name']}")
            print(f"   Email: {admin_user['email']}")
            print(f"   Role: {admin_user['role']}")
            print(f"   ID: {admin_user['id']}")
            print()
            print("🎯 Admin can now login to the system!")
            
        except Exception as e:
            print(f"❌ Error creating admin user: {e}")
            return False
        
        return True

def create_default_admin():
    """Create a default admin with predefined credentials"""
    app = create_app()
    
    with app.app_context():
        user_model = app.user_model
        
        print("🔧 Creating Default Admin User")
        print("=" * 50)
        
        # Check if admin already exists
        existing_admin = user_model.collection.find_one({'role': 'admin'})
        if existing_admin:
            print(f"✅ Admin user already exists: {existing_admin['email']}")
            return
        
        # Default admin credentials
        default_admin = {
            'name': 'System Administrator',
            'email': 'admin@exammonitoring.com',
            'password': 'admin123',
            'role': 'admin'
        }
        
        try:
            admin_user = user_model.create_user(
                name=default_admin['name'],
                email=default_admin['email'],
                password=default_admin['password'],
                role=default_admin['role']
            )
            
            print("✅ Default admin user created successfully!")
            print(f"   Email: {default_admin['email']}")
            print(f"   Password: {default_admin['password']}")
            print(f"   Name: {default_admin['name']}")
            print()
            print("⚠️  IMPORTANT: Change the default password after first login!")
            
        except Exception as e:
            print(f"❌ Error creating default admin: {e}")

def main():
    """Main function"""
    if len(sys.argv) > 1 and sys.argv[1] == '--default':
        create_default_admin()
    else:
        seed_admin()

if __name__ == "__main__":
    main()

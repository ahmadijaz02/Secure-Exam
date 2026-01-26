#!/usr/bin/env python3
"""
Test script to verify API endpoints
"""

import requests
import json

def test_health_endpoint():
    """Test the health endpoint"""
    try:
        response = requests.get('http://localhost:5000/api/health')
        print(f"Health endpoint status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Health endpoint error: {e}")
        return False

def test_signup_endpoint():
    """Test the signup endpoint"""
    try:
        data = {
            "name": "Test Teacher",
            "email": "teacher@test.com",
            "password": "password123",
            "role": "teacher"
        }
        
        response = requests.post(
            'http://localhost:5000/api/auth/signup',
            headers={'Content-Type': 'application/json'},
            json=data
        )
        
        print(f"Signup endpoint status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code in [200, 201]
    except Exception as e:
        print(f"Signup endpoint error: {e}")
        return False

def test_login_endpoint():
    """Test the login endpoint"""
    try:
        data = {
            "email": "teacher@test.com",
            "password": "password123"
        }
        
        response = requests.post(
            'http://localhost:5000/api/auth/login',
            headers={'Content-Type': 'application/json'},
            json=data
        )
        
        print(f"Login endpoint status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Login endpoint error: {e}")
        return False

def main():
    """Run all API tests"""
    print("🧪 Testing API Endpoints\n")
    
    tests = [
        ("Health Check", test_health_endpoint),
        ("User Signup", test_signup_endpoint),
        ("User Login", test_login_endpoint)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{'='*50}")
        print(f"Testing: {test_name}")
        print('='*50)
        
        result = test_func()
        results.append((test_name, result))
    
    print(f"\n{'='*50}")
    print("API TEST SUMMARY")
    print('='*50)
    
    all_passed = True
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
        if not result:
            all_passed = False
    
    print(f"\n{'='*50}")
    if all_passed:
        print("🎉 ALL API TESTS PASSED! Server is working correctly.")
    else:
        print("⚠️  SOME API TESTS FAILED. Check the errors above.")
    print('='*50)

if __name__ == "__main__":
    main()

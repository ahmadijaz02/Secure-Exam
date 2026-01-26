#!/usr/bin/env python3
"""
Test script to verify MongoDB integration
"""

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """Test if all modules can be imported"""
    try:
        print("Testing imports...")

        # Test config import
        import config
        print("✓ Config module imported successfully")

        # Test app creation
        from app import create_app
        print("✓ App factory imported successfully")

        # Test models
        from app.models import User, ExamSession, Incident
        print("✓ MongoDB models imported successfully")

        print("\n✅ All imports successful!")
        return True

    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def test_mongodb_connection():
    """Test MongoDB connection"""
    try:
        print("\nTesting MongoDB connection...")

        from pymongo import MongoClient
        from config import config

        # Get configuration
        app_config = config['development']

        # Test connection
        client = MongoClient(app_config.MONGODB_URI)
        db = client[app_config.MONGODB_DB_NAME]

        # Ping the database
        client.admin.command('ping')
        print("✓ MongoDB connection successful")

        # Test basic operations
        test_collection = db.test_collection
        test_doc = {"test": "document", "timestamp": "2025-01-01"}

        # Insert test document
        result = test_collection.insert_one(test_doc)
        print(f"✓ Test document inserted with ID: {result.inserted_id}")

        # Find test document
        found_doc = test_collection.find_one({"_id": result.inserted_id})
        if found_doc:
            print("✓ Test document retrieved successfully")

        # Clean up test document
        test_collection.delete_one({"_id": result.inserted_id})
        print("✓ Test document cleaned up")

        client.close()
        return True

    except Exception as e:
        print(f"❌ MongoDB connection error: {e}")
        print("💡 Make sure MongoDB is running on localhost:27017")
        return False

def test_app_creation():
    """Test app creation with MongoDB"""
    try:
        print("\nTesting app creation...")

        from app import create_app

        app = create_app('development')
        print("✓ Flask app created successfully")

        # Test if MongoDB models are initialized
        if hasattr(app, 'user_model'):
            print("✓ User model initialized")
        if hasattr(app, 'exam_session_model'):
            print("✓ ExamSession model initialized")
        if hasattr(app, 'incident_model'):
            print("✓ Incident model initialized")

        return True

    except Exception as e:
        print(f"❌ App creation error: {e}")
        return False

def run_all_tests():
    """Run all tests"""
    print("🧪 Starting MongoDB Integration Tests\n")

    tests = [
        ("Import Tests", test_imports),
        ("MongoDB Connection", test_mongodb_connection),
        ("App Creation", test_app_creation)
    ]

    results = []
    for test_name, test_func in tests:
        print(f"\n{'='*50}")
        print(f"Running: {test_name}")
        print('='*50)

        result = test_func()
        results.append((test_name, result))

    print(f"\n{'='*50}")
    print("TEST SUMMARY")
    print('='*50)

    all_passed = True
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
        if not result:
            all_passed = False

    print(f"\n{'='*50}")
    if all_passed:
        print("🎉 ALL TESTS PASSED! MongoDB integration is working correctly.")
    else:
        print("⚠️  SOME TESTS FAILED. Please check the errors above.")
    print('='*50)

    return all_passed

if __name__ == "__main__":
    run_all_tests()

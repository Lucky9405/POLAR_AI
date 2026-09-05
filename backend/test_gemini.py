import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise RuntimeError(
        "GEMINI_API_KEY was not found. Check backend/.env"
    )

print("Gemini API key loaded successfully.")

client = genai.Client(api_key=api_key)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=(
        "You are the AI Energy Advisor for POLAR-AI. "
        "Explain in one sentence why battery reserve is important "
        "at an Antarctic research station."
    ),
)

print("\nGemini response:")
print(response.text)
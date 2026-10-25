from datetime import datetime
from pathlib import Path

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from helpers import BASE_URL, build_driver, must_leave_login, sign_in

REPORTS = Path(__file__).resolve().parent / "reports"
REPORTS.mkdir(exist_ok=True)
stamp = datetime.now().strftime("%H%M%S")
email = f"selenium.worker.{stamp}@example.com"
phone = ("98" + stamp + "01")[:10]

driver = build_driver()
try:
    driver.get(BASE_URL + "/login")
    sign_in(driver, "admin@example.com", "123")
    must_leave_login(driver)
    driver.get(BASE_URL + "/admin/people/workers")
    WebDriverWait(driver, 15).until(
        EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Add Worker')]"))
    ).click()
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "name")))
    driver.find_element(By.ID, "name").send_keys("Selenium Worker")
    driver.find_element(By.ID, "email").send_keys(email)
    driver.find_element(By.ID, "phone_number").send_keys(phone)
    driver.find_element(By.ID, "password").send_keys("Worker_12345678")
    driver.find_element(By.XPATH, "//button[contains(., 'Create Worker')]").click()
    WebDriverWait(driver, 20).until(
        lambda d: "successfully" in d.page_source.lower() or email in d.page_source
    )
    driver.save_screenshot(str(REPORTS / "07_create_worker.png"))
    print("PASS: create worker with valid details")
    print(f"EMAIL: {email}")
    print(f"PHONE: {phone}")
    print("SCREENSHOT: tests/selenium/reports/07_create_worker.png")
finally:
    driver.quit()
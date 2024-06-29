import React, { useState, useEffect, useRef } from 'react';
import DatePicker from 'react-datepicker';
import Papa from 'papaparse';
import { gapi } from 'gapi-script';
import 'react-datepicker/dist/react-datepicker.css';
import './index.css';

const CLIENT_ID = '227217320704-n0fikqdg73pvch1gvvslrf6mjmjs2kt9.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBnJsALKryk0ucLiHw0ox6D6BwTGe4M7xE';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const getWeekendDays = (startDate, endDate) => {
  const days = [];
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
      days.push(new Date(date));
    }
  }
  return days;
};

const initialData = JSON.parse(localStorage.getItem('attendanceData')) || [];

const App = () => {
  const [students, setStudents] = useState(initialData);
  const [newStudentIndex, setNewStudentIndex] = useState(null);
  const inputRef = useRef(null);
  const [startDate, setStartDate] = useState(new Date('2024-06-28'));
  const [endDate, setEndDate] = useState(new Date('2024-07-31'));
  const [days, setDays] = useState(getWeekendDays(startDate, endDate));
  const [dateError, setDateError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [authInstance, setAuthInstance] = useState(null);

  useEffect(() => {
    gapi.load('client:auth2', initClient);
  }, []);

  useEffect(() => {
    localStorage.setItem('attendanceData', JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    if (newStudentIndex !== null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [newStudentIndex]);

  useEffect(() => {
    if (startDate <= endDate) {
      setDays(getWeekendDays(startDate, endDate));
      setDateError('');
    } else {
      setDateError('Start date must be before end date.');
    }
  }, [startDate, endDate]);

  const initClient = () => {
    gapi.client.init({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
      scope: SCOPES,
    }).then(() => {
      const authInstance = gapi.auth2.getAuthInstance();
      setAuthInstance(authInstance);
    });
  };

  const signIn = () => {
    if (authInstance) {
      authInstance.signIn();
    }
  };

  const signOut = () => {
    if (authInstance) {
      authInstance.signOut();
    }
  };

  const handleInputChange = (index, name, value) => {
    const newStudents = [...students];
    newStudents[index][name] = value;
    setStudents(newStudents);
  };

  const handleInputBlur = (index) => {
    const newStudents = sortStudents([...students]);
    setStudents(newStudents);
    setNewStudentIndex(null);
  };

  const handleAddStudent = () => {
    const newStudents = [...students, { name: '', attendance: Array(days.length).fill(false) }];
    setStudents(newStudents);
    setNewStudentIndex(newStudents.length - 1);
  };

  const handleAttendanceChange = (studentIndex, dayIndex) => {
    const newStudents = [...students];
    newStudents[studentIndex].attendance[dayIndex] = !newStudents[studentIndex].attendance[dayIndex];
    setStudents(newStudents);
  };

  const handleDeleteStudent = (index) => {
    const newStudents = students.filter((_, i) => i !== index);
    setStudents(newStudents);
  };

  const sortStudents = (students) => {
    return students.sort((a, b) => a.name.localeCompare(b.name));
  };

  const calculateTotals = (attendance) => {
    const totalDays = days.length;
    const totalPresent = attendance.filter(day => day).length;
    const totalAbsent = totalDays - totalPresent;
    const percentage = ((totalPresent / totalDays) * 100).toFixed(2);
    return { totalDays, totalPresent, totalAbsent, percentage };
  };

  const exportToCSV = () => {
    const headers = ['Name', ...days.map(day => day.toDateString()), 'Total Days', 'Days Present', 'Days Absent', 'Percentage'];
    const rows = students.map(student => {
      const { totalDays, totalPresent, totalAbsent, percentage } = calculateTotals(student.attendance);
      return [
        student.name,
        ...student.attendance.map(attended => (attended ? 'Present' : 'Absent')),
        totalDays,
        totalPresent,
        totalAbsent,
        percentage
      ];
    });

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += headers.join(',') + '\n';
    rows.forEach(row => {
      csvContent += row.join(',') + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'attendance.csv');
    document.body.appendChild(link);
    link.click();
  };

  const saveToDrive = async () => {
    const headers = ['Name', ...days.map(day => day.toDateString()), 'Total Days', 'Days Present', 'Days Absent', 'Percentage'];
    const rows = students.map(student => {
      const { totalDays, totalPresent, totalAbsent, percentage } = calculateTotals(student.attendance);
      return [
        student.name,
        ...student.attendance.map(attended => (attended ? 'Present' : 'Absent')),
        totalDays,
        totalPresent,
        totalAbsent,
        percentage
      ];
    });

    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
      csvContent += row.join(',') + '\n';
    });

    const file = new Blob([csvContent], { type: 'text/csv' });
    const metadata = {
      name: 'attendance.csv',
      mimeType: 'text/csv',
    };

    const token = gapi.auth.getToken();
    if (!token) {
      console.error('Error: User is not authenticated');
      return;
    }
    const accessToken = token.access_token;

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form,
    });
  };

  const importFromDrive = async () => {
    const response = await gapi.client.drive.files.list({
      q: "name='attendance.csv'",
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const file = response.result.files[0];
    if (file) {
      const fileId = file.id;
      const result = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
      });

      const parsedData = Papa.parse(result.body, { header: true });
      const data = parsedData.data;
      const newStudents = data.map(row => {
        const name = row.Name;
        const attendance = Object.keys(row).slice(1).map(key => row[key] === 'Present');
        return { name, attendance };
      });

      setStudents(newStudents);
    }
  };

  const importFromCSV = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (result) => {
        const headers = result.data[0];
        const data = result.data.slice(1);

        if (headers.length !== days.length + 1 || headers[0] !== 'Name') {
          setImportMessage('Error: Invalid CSV format.');
          return;
        }

        for (const row of data) {
          if (row.length !== headers.length) {
            setImportMessage('Error: Inconsistent row length.');
            return;
          }
        }

        const newStudents = data.map(row => {
          const name = row[0];
          const attendance = row.slice(1, days.length + 1).map(day => day === 'Present');
          return { name, attendance };
        });

        setStudents(newStudents);
        setImportMessage('Import successful!');
      },
      header: false,
      error: () => {
        setImportMessage('Error: Unable to parse CSV.');
      }
    });
  };

  return (
    <div className="min-h-screen p-5 bg-gray-100">
      <h1 className="text-2xl font-bold mb-5 text-center text-blue-600">Attendance Register</h1>
      <div className="flex justify-center mb-5">
        <DatePicker
          selected={startDate}
          onChange={(date) => setStartDate(date)}
          selectsStart
          startDate={startDate}
          endDate={endDate}
          className="border rounded px-2 py-1 w-36"
        />
        <span className="mx-2">to</span>
        <DatePicker
          selected={endDate}
          onChange={(date) => setEndDate(date)}
          selectsEnd
          startDate={startDate}
          endDate={endDate}
          className="border rounded px-2 py-1 w-36"
        />
      </div>
      {dateError && <div className="text-red-500 text-center mb-5">{dateError}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded shadow-md overflow-hidden">
          <thead className="bg-blue-500 text-white">
            <tr>
              <th className="py-2 px-4">Name</th>
              {days.map((day, index) => (
                <th key={index} className="py-2 px-4">{day.toDateString()}</th>
              ))}
              <th className="py-2 px-4">Total Days</th>
              <th className="py-2 px-4">Days Present</th>
              <th className="py-2 px-4">Days Absent</th>
              <th className="py-2 px-4">Percentage</th>
              <th className="py-2 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, index) => {
              const { totalDays, totalPresent, totalAbsent, percentage } = calculateTotals(student.attendance);
              return (
                <tr key={index} className={`border-b ${index % 2 === 0 ? 'bg-gray-100' : 'bg-white'}`}>
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={student.name || ''}
                      onChange={(e) => handleInputChange(index, 'name', e.target.value)}
                      onBlur={() => handleInputBlur(index)}
                      ref={index === newStudentIndex ? inputRef : null}
                      className="w-40 md:w-60 lg:w-80 xl:w-96 px-2 py-1 border rounded"
                    />
                  </td>
                  {days.map((_, dayIndex) => (
                    <td key={dayIndex} className="py-2 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={student.attendance[dayIndex] || false}
                        onChange={() => handleAttendanceChange(index, dayIndex)}
                      />
                    </td>
                  ))}
                  <td className="py-2 px-4 text-center">{totalDays}</td>
                  <td className="py-2 px-4 text-center">{totalPresent}</td>
                  <td className="py-2 px-4 text-center">{totalAbsent}</td>
                  <td className="py-2 px-4 text-center">{percentage}%</td>
                  <td className="py-2 px-4 text-center">
                    <button
                      onClick={() => handleDeleteStudent(index)}
                      className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {importMessage && <div className="text-center my-5">{importMessage}</div>}
      <div className="flex justify-between mt-5">
        <button
          onClick={handleAddStudent}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Add Student
        </button>
        <div>
          <input
            type="file"
            id="csvFileInput"
            accept=".csv"
            onChange={importFromCSV}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 w-full"
          />
          <button
            onClick={exportToCSV}
            className="ml-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Export to CSV
          </button>
          <button
            onClick={saveToDrive}
            className="ml-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Save to Drive
          </button>
          <button
            onClick={importFromDrive}
            className="ml-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Import from Drive
          </button>
        </div>
      </div>
      <button
        onClick={signIn}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mt-5"
      >
        Sign In with Google
      </button>
      <button
        onClick={signOut}
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 mt-5"
      >
        Sign Out
      </button>
    </div>
  );
};

export default App;
